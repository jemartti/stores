Stores is a modern, opinionated persistence layer built on the latest in javascript - generators - and the latest jsonb functionality in postgresql.  Using redis and postgres's new jsonb functionality available in 9.4,
it provides an easy-to-use opensource persistence layer alternative to mongo.

Migrations is included, using an all-in-one migrations system, that allows you to keep your DDL in a single file for easy visibility.

Shards is included, and currently includes a basic modulo sharding strategy.

It's opinions are:  
1.  Most data should be key value pair as this is shard friendly.  If you want to use the Store functions, your table must have the structure of id, value where value is a jsonb document.  See the migration below with an example DDL of this table structure.
2.  The key should be a nice long integer using something like simpleflake.  If no id is passed in your record it generates a nice simpleflake id for you.  Because javascript doesn't support 64-bit ints, you have to pass the id as a string into Store.  It has a hard assert on this.
3.  It is built for postgres 9.4 only as it's backend, because we love all the awesome jsonb stuff that postgres provides.  
4.  It is built with redis as a caching layer on top of it, because you should always cache.  You can disable the cache using options.
5.  Most queries should come from the cache... but sometimes you have to do queries against the db, so it provides methods for both.
6.  Generators and co so your persistence calls aren't callback hell land.

It has a strict dependencies on co and postgres 9.4.

```
npm install node-stores
```

```
var Store = require('node-stores').Store;
var store = new Store(db, redis, opts);
```

db, redis, opts config examples:
```
{
  host: 'localhost',
  port: '5432',
  database: 'test',
  user: 'testuser',
  password: 'testy123',
  poolsize: 50
}
```

Redis config:
```
{
  host: 'localhost',
  port: '2379',
  opts: {a bunch of normal redis options you can use}
};
```

Opts config:
```
{
    cache: true, // controls if redis is used as for caching
    transaction: true // wraps the query in a transaction if true
}

To query:
```
// the first param is a table name, the second param is a nice long unique id as a key
store.find('testtablename', '424234324324222');

// this returns everything!!
store.findAll('testtablename');

// when all else fails do a raw query against the table
store.query('select foo from bar where bar="boo"');

// AWESOME JSONB STUFF FROM PSQL 9.4
// finds any records with the json record bar: 'boo'
store.findByJSON('testytable', {bar: 'boo'});

// returns any records that have an array defined by a specific key that contain a specific value
// any recors with an array named boo that contain the value 1
// {boo: [1,2,3]} -> this will return
// {boo: [4,5,6]} -> this will not
store.findByJsonArrayContains('testytable', 'boo', 1);

```

To insert:
```
// note that you must have id in the record!
store.insert('testytable', {id: '432234324324', name: 'Foo', state:'active'});
```

To update:

```
// again you need an id in the record!
store.update('testytable', {id: '432234324324', name: 'Bar', state:'disabled'});

// updates the record with id 432234324324, sets the 'name' key to 'Foo'
// this is wrapped in a nice transaction for you!
store.updateProperty('testtable', '432234324324', 'name', 'Foo');

// runs the function you pass on a object and updates it
// also wrapped in a transaction
store.updateObject('testtable', '432234324324', function * (object) {
    object[name] = 'boo';
    return object;
});
```

to delete:

```
// id is the nice long id string we have been using
store.delete('testytable', '432234324324');
```

### Shards
Shards sets up a very basic modulo based sharding strategy for your databases.  It shards based on the id of the record.
```
var Shards = require('store').Shards;
var shards = new Shards([{
      db: db,  // same as Store db
      redis: redis, // same as Store redis
      opts: opts, // same as Store opts
      id: id  // this is the id that you want to this server to handle, e.g. 0 for all modulo 0 records
    }]);
var store = shards.mod('432343243432'); /// where the long number is the id
store.insert(table, record);
```

### Migrations
Migrations lets you run migrations on your database.
```
var migrations = require('migrations');

migrationsList = [{
    name: 'test',
    type: 'db',
    migration: 'CREATE TABLE IF NOT EXISTS test ( \
        id bigint PRIMARY KEY, \
        value jsonb \
        );\
        CREATE INDEX test_value_idx ON test USING gin (value jsonb_path_ops);'
}];

migrations.runMigrations(migrationsList, db); // db is same config as Store db
```
