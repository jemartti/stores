Stores is a modern, opinionated persistence layer built on the latest in javascript - generators - and the latest jsonb functionality in postgresql.  Using redis and postgres's new jsonb functionality available in 9.4,
it provides an easy-to-use opensource persistence layer alternative to mongo.

It's opinions are:  
1.  Most data should be key value pair as this is shard friendly.  
2.  The key should be a nice long integer using something like simpleflake.  If no id is passed in your record it generates a nice simpleflake id for you.  
3.  It is built for postgres 9.4 only as it's backend, because we love all the awesome jsonb stuff that postgres provides.  
4.  It is built with redis as a caching layer on top of it, because you should always cache.  
5.  Most queries should come from the cache... but sometimes you have to do queries against the db, so it provides methods for both.  
6.  Generators and co so your persistence calls aren't callback hell land.  
7.  Migrations are correlated to persistence, and migrations should live in a single file so your DDL is not spread across bazillions of timestamped files.  

It has a strict dependency on co and postgres 9.4 and up.  This sets up persistence with redis fronted postgresql 9.4 backend.

```
npm install stores
```

```
var store = require('Store')(db, redis);
```

Database config
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
