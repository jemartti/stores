var pg = require('co-pg')(require('pg'));
var assert = require('assert');
var co = require('co');
var redis = require('redis');
var coredis = require('co-redis');
var utils = require('./utils');
var util = require('util');



var validId = function (id) {
    assert(id && ((typeof id === 'string') || id instanceof String), "You must pass the id as a string");
    return id;
};

var validate = function (table, record) {
    assert(table && record, "You must pass a valid table and record object");
    return validId(record.id);
};

/*
valid opts
{
cache: true | false, // if disabled no redis queries are performed, default true
transaction: true | false // if enabled all queries are wrapped in a transaction, default true
}
*/
function Store(db, redisConfig, opts) {
    assert(db, "Stores requires a valid db");
    this.dbUrl = utils.createUrl(db);
    this.opts = opts || {cache: true, transaction: true};
    pg.defaults.poolSize = db.poolSize || 15;

    if (this.opts.cache) {
        //this.redisClient = require('co-redis')(require('redis').createClient(redis.port, redis.host, redis.opts));
        this.redisClient = coredis(redis.createClient(redisConfig.port, redisConfig.host, redisConfig.opts));

        this.redisClient.on("error", function (err) {
            console.error("Redis client error " + err);
            console.error(err.stack);
        });
    }
}

Store.prototype.resolveOpts = function (opts) {
    opts = opts || this.opts;
    opts.cache = opts.cache || true;
    opts.transaction = opts.transaction || true;
    return opts;
};


/*
performs the actual sql query, ensuring the pg connection is created
and released properly.  If transaction mode is enabled, turns on
*/
Store.prototype.doSQL = function * (transaction, sqlfn) {
    assert(sqlfn, "You must pass a sql function to execute");
    var connection = yield pg.connectPromise(this.dbUrl);
    var pgClient = connection[0];
    var done = connection[1];
    var result;
    try {
        if (transaction) yield pgClient.queryPromise('BEGIN');
        result = yield sqlfn(pgClient);
        if (transaction) yield pgClient.queryPromise('END');
    } catch (err) {
        if (transaction) yield pgClient.queryPromise('ROLLBACK');
        console.error('Stores exception, could not execute query');
        console.error(err.stack);
        done();
        throw err;
    }
    done();
    return result;
};

/*
inserts a new record, pass your own id or we will generate a simpleflake id for you
returns the inserted record or null
*/
Store.prototype.insert = function * (table, record, opts) {
    if (!record.id) record.id = utils.generateNumber();
    var id = validate(table, record);
    opts = this.resolveOpts(opts);
    var _this = this;

    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "INSERT INTO " + table + " (id, value) VALUES ($1, $2);";
        var result = yield pgClient.queryPromise(queryString, [id, JSON.stringify(record)]);
        if (!result || !result.rowCount || !(result.rowCount === 1)) return null;
        if (opts.cache) {
            yield _this.redisClient.set(table + '/' + id, JSON.stringify(record));
        }
        return record;
    });
};


/*
raw update of an object, be careful not to overwrite properties
returns success - true/false
*/
Store.prototype.update = function * (table, record, opts) {
    var id = validate(table, record);
    opts = this.resolveOpts(opts);
    var _this = this;

    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "UPDATE " + table + " SET value = $2 WHERE id = $1;";
        var result = yield pgClient.queryPromise(queryString, [id, JSON.stringify(record)]);
        if (!result || !result.rowCount || !(result.rowCount === 1)) return false;
        if (opts.cache) yield _this.redisClient.set(table + '/' + id, JSON.stringify(record));
        return true;
    });
};

/*
a nice safe transaction wrapped way to update a single property in
a json document, you have to fetch the record, modify it and then
persist the update.
returns updated record or null
*/
Store.prototype.updateProperty = function * (table, id, key, value, opts) {
    var id = validate(table, {id: id});
    opts = this.resolveOpts(opts);

    // always wrap this in a transaction
    var _this = this;
    return yield this.doSQL(true, function * (pgClient) {
        var object = null;
        if (opts.cache) {
            var reply = yield _this.redisClient.get(table + '/' + id);
            if (reply) object = JSON.parse(reply);
        }
        if (!object) {
            var queryString = "SELECT value FROM " + table + " WHERE id=$1;";
            var result = yield pgClient.queryPromise(queryString, [id]);
            if (!result || !result.rows || !result.rows[0] || !(result.rows[0].value)) throw new Error ('Sorry, the object did not exist for id ' + id);
            object = result.rows[0].value;
        }

        object[key] = value;

        var queryString = "UPDATE " + table + " SET value = $2 WHERE id = $1;";
        var result = yield pgClient.queryPromise(queryString, [id, JSON.stringify(object)]);
        if (!result || !result.rowCount || !(result.rowCount === 1)) return null;
        if (opts.cache) yield _this.redisClient.set(table + '/' + id, JSON.stringify(object));
        return object;
    });
};


/*
a nice safe transaction wrapped way to update an object with a function,
you have to fetch the record, modify it and then persist the update.
returns updated record or null
*/
Store.prototype.updateObject = function * (table, id, updateFn, opts) {
    var id = validate(table, {id: id});
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(true, function * (pgClient) {
        var object = null;
        if (opts.cache) {
            var reply = yield _this.redisClient.get(table + '/' + id);
            if (reply) object = JSON.parse(reply);
        }
        if (!object) {
            var queryString = "SELECT value FROM " + table + " WHERE id=$1;";
            var result = yield pgClient.queryPromise(queryString, [id]);
            if (!result || !result.rows || !result.rows[0] || !(result.rows[0].value)) throw new Error ('Sorry, the object did not exist for id ' + id);
            object = result.rows[0].value;
        }
        object = yield updateFn(object);
        id = validate(table, object);

        var queryString = "UPDATE " + table + " SET value = $2 WHERE id = $1;";
        var result = yield pgClient.queryPromise(queryString, [id, JSON.stringify(object)]);
        if (!result || !result.rowCount || !(result.rowCount === 1)) return null;
        if (opts.cache) yield _this.redisClient.set(table + '/' + id, JSON.stringify(object));
        return object;
    });
};

/*
finds a record in the db based on the id
returns single elem or null
*/
Store.prototype.find = function * (table, id, opts) {
    var id = validate(table, {id: id});
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        if (opts.cache) {
            var reply = yield _this.redisClient.get(table + '/' + id);
            if (reply) return JSON.parse(reply);
        }


        var queryString = "SELECT value FROM " + table + " WHERE id=$1;";
        var result = yield pgClient.queryPromise(queryString, [id]);
        if (!result || !result.rows || !result.rows[0] || !(result.rows[0].value)) return null;
        if (opts.cache) yield _this.redisClient.set(table + '/' + id, JSON.stringify(result.rows[0].value));
        return result;
    });
};


/*
fetches all the records for a given table
returns array of elems or empty array
*/
Store.prototype.findAll = function * (table, opts) {
    assert(table, "You must pass a valid table");
    opts = this.resolveOpts(opts);

    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "SELECT * FROM " + table + ";";
        var result = yield pgClient.queryPromise(queryString);
        if (!result || !result.rowCount) return [];
        return result.rows.map(function mapFindAll(row) {
            return row.value;
        });
    });
};


/*
cache friendly way to find a group of ids
it first uses mget to try to fetch all the objects from the db
if any are not available in cache, we query the db
and reload the cache so its better next time
returns array of elems or empty array
*/
Store.prototype.findAllByIds = function * (table, ids, opts) {
    assert(table && ids && ids.length > 0, "You must send a valid table and more than 0 ids");
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        if (opts.cache) {
            var redisKeys = ids.map( function (id) {
                validId(id);
                return table + '/' + id;
            });
            var results = [];

            if (redisKeys.length > 0){
                results = yield _this.redisClient.mget.apply(this,redisKeys);
            }

            var anyNulls = false;
            results = results.map(function (result) {
                if (!result) {
                    anyNulls = true;
                    return null;
                }
                return JSON.parse(result);
            });
            //  if the cache was clean and had no nulls, return the results
            if (!anyNulls) {
                return results;
            }
        }

        var args = ids.map(function (id, index) {
            return '$' + (index + 1);
        });
        var queryString = 'select value from ' + table + ' where id IN (' + args.join(',') + ');';
        var result = yield pgClient.queryPromise(queryString, ids);
        if (!result || !result.rows) return [];

        var cacheResults = [];
        var returnResults = result.rows.map(function mapFindAll(row) {
            if (opts.cache) cacheResults.push(_this.redisClient.set(table + '/' + row.id, JSON.stringify(row.value)));
            return row.value;
        });
        // We want to run this asynchronously so updating cache doesn't block results
        if (opts.cache) {
            co(function * findAllByIdsUpdateRedis() {
                cacheResults = yield cacheResults;
            }).catch(function (err) {
                logger.error("FindAllByIds cache update exception: " + err.stack);
            });
        }

        return returnResults;
    });
};

/*
Searches the JSON document for an array that contains the value in contains
e.g. in the json object '{"foo": ["1", "2", "3"]}'', you would call
findJsonArrayContains(table, "'foo'", "2") and it would return the element.
returns array of elems or empty array
*/
Store.prototype.findByJSON = function * (table, properties, opts) {
    assert(table, "You must pass a valid table");
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "select value from " + table + " where value @> '" + JSON.stringify(properties) + "';";
        var result = yield pgClient.queryPromise(queryString);
        if (!result || !result.rows) return [];
        return result.rows.map(function (row) {
            return row.value;
        });
    });
};

/*
Searches the JSON document for an array that contains the value in contains
e.g. in the json object '{"foo": ["1", "2", "3"]}'', you would call
findJsonArrayContains(table, "'foo'", "2") and it would return the element.
returns array of elems or empty array
*/
Store.prototype.findJSONArrayContains = function * (table, arrayKey, contains, opts) {
    assert(table && arrayKey && contains, "You must pass a valid table, array key and contains value");
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "select value from " + table + " where value->" + arrayKey + " @> '\"" + contains + "\"'";
        var result = yield pgClient.queryPromise(queryString);
        if (!result || !result.rows) return [];
        return result.rows.map(function (row) {
            return row.value;
        });
    });
};

/*
Searches the JSON document for a key that matches a json object who's value also matches contains
e.g. in the json object '{"foo": "blah", "bar": {"blah": "blah"}}', if you call store.findJsonSubContains(table, "bar", {blah: "blah"})
it would match it
returns array of elems or empty array
*/
Store.prototype.findJSONSubContains = function * (table, arrayKey, contains, opts) {
    assert(table && arrayKey && contains, "You must pass a valid table, array key and contains value");
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "select value from " + table + " where value->" + arrayKey + " @> '" + JSON.stringify(contains) + "';";
        var result = yield pgClient.queryPromise(queryString);
        if (!result || !result.rows) return [];
        return result.rows.map(function (row) {
            return row.value;
        });
    });
};


/*
Performs a raw query on the database, useful for tables that are relational
returns array of elems or empty array
*/
Store.prototype.query = function * (queryString, opts) {
    assert(queryString, "You must pass a valid query string");
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var result = yield pgClient.queryPromise(queryString);
        return (result && result.rows && (result.rows.length > 0)) ? result.rows : [];
    });
};

/*
deletes a record from the table by id
returns success - true/false
*/
Store.prototype.delete = function * (table, id, opts) {
    var id = validate(table, {id: id});
    opts = this.resolveOpts(opts);

    var _this = this;
    return yield this.doSQL(opts.transaction, function * (pgClient) {
        var queryString = "DELETE FROM " + table + " WHERE id=$1;";
        var result = yield pgClient.queryPromise(queryString, [id]);
        if (!result || !result.rowCount || !(result.rowCount === 1)) return false;
        yield _this.redisClient.del(table + '/' + id);
        return true;
    });
};


module.exports = Store;
