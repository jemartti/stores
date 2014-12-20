require('co-mocha');
var assert = require('assert');
var Store = require('../lib/store');
var util = require('util');

var db = {
    host: 'localhost',
    port: 5432,
    database: 'test',
    user: 'testy',
    password: 'test'
};
var redis = {
    host: 'localhost',
    port: 6379
};

var redisClient = require('co-redis')(require('redis').createClient(redis.port, redis.host));
var m = require('../lib/migrations');

var migrations = [{
    name: 'test',
    type: 'db',
    migration: 'CREATE TABLE IF NOT EXISTS test ( \
        id bigint PRIMARY KEY, \
        value jsonb \
    );\
    CREATE INDEX test_value_idx ON test USING gin (value jsonb_path_ops);'
}];


describe('check stores', function () {

    var store = new Store(db, redis, {cache: true, transaction: true});

    before(function * () {
        yield m.runMigrations(migrations, db);
    });

    it('inserts data', function * () {
        var record = yield store.insert('test', {message: 'test'});
        assert(record.id);
        assert(record.message = 'test');
        assert(yield store.delete('test', record.id));
    });

    it('reads data', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var foundRecord = yield store.find('test', record.id);
        assert(record.id === foundRecord.id);
        assert(record.message === 'test');
        assert(yield store.delete('test', record.id));
    });

    it('updates a record', function * () {
        var record = yield store.insert('test', {message: 'test'});
        record.message = 'test2';
        var update = yield store.update('test', record);
        assert(update);
        var found = yield store.find('test', record.id);
        assert(found.message === 'test2');
        yield store.delete('test', record.id);

    });

    it('updates a json property', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var update = yield store.updateProperty('test', record.id, 'message', 'test3');
        assert(update);
        var found = yield store.find('test', record.id);
        yield store.delete('test', record.id);
        assert(found.message === 'test3');
    });

    it('updates object based on a function', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var update = yield store.updateObject('test', record.id, function * (object){
            object.message = 'test4'
            return object;
        });
        var found = yield store.find('test', record.id);
        yield store.delete('test', record.id);
        assert(found.message === 'test4');
    });

    it('finds all', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var found = yield store.findAll('test');
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].message === 'test');
        assert(found[0].id === record.id);
    });

    it('finds all by id', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var found = yield store.findAllByIds('test', [record.id]);
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].message === 'test');
        assert(found[0].id === record.id);
    });

    it('finds all by id with null', function * () {
        var record = yield store.insert('test', {message: 'test'});
        yield redisClient.del('test/' + record.id);
        var found = yield store.findAllByIds('test', [record.id]);
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].message === 'test');
        assert(found[0].id === record.id);
    });

    it('finds by json', function * () {
        var record = yield store.insert('test', {message: 'testjson'});
        var found = yield store.findByJSON('test',{message: 'testjson'});
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].message === 'testjson');
        assert(found[0].id === record.id);
    });

    it('finds in json array', function * () {
        var record = yield store.insert('test', {message: ['testjson']});
        var found = yield store.findJSONArrayContains('test',"'message'", "testjson");
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].id === record.id);
        assert(found[0].message[0] === 'testjson');
    });


    it('raw query', function * () {
        var record = yield store.insert('test', {message: 'test'});
        var found = yield store.query("select * from test;");
        yield store.delete('test', record.id);
        assert(found.length === 1);
        assert(found[0].id);
        assert(found[0].value);
        assert(found[0].value.id === record.id);
        assert(found[0].value.message === 'test');
    });

});
