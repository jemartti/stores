var pg = require('co-pg')(require('pg'));
var utils = require('./utils');

var migrate = function * (migration, dbUrl) {
  var connectionResults = yield pg.connectPromise(dbUrl);
  var pgClient = connectionResults[0];
  var done = connectionResults[1];
  var result;
  try {
    result = yield pgClient.queryPromise(migration.migration);
    result = yield pgClient.queryPromise('UPDATE migrations set ran=true, ran_on=now() where name=$1', [migration.name]);
  } catch (err) {
    console.error("Could not execute migration " + migration.name);
    console.error(err.stack);
  } finally {
    done();
  }
  done();
  console.log('Ran migration: ' + migration.name);
};

var createMigrationsTable = function * (dbUrl) {
  var connectionResults = yield pg.connectPromise(dbUrl);
  var pgClient = connectionResults[0];
  var done = connectionResults[1];
  var queryString = 'CREATE TABLE IF NOT EXISTS migrations ( \
    name varchar(1024) PRIMARY KEY, \
    migration TEXT, \
    ran_on timestamp, \
    ran boolean DEFAULT false);';
    try {
      yield pgClient.queryPromise(queryString);
    } catch (err) {
      console.error("Could not create migrations table");
      console.error(err.stack);
    } finally {
      done();
    }
  };

var addMigration = function * (migration, dbUrl) {
  var connectionResults = yield pg.connectPromise(dbUrl);
  var pgClient = connectionResults[0];
  var done = connectionResults[1];
  var queryString = 'select * from migrations WHERE name=$1;';
  var result;
  try {
    result = yield pgClient.queryPromise(queryString, [migration.name]);
    if (!result || result.rowCount === 0) {
      console.log('Creating migration: ' + migration.name);
      queryString = 'INSERT INTO migrations (name, migration,ran) VALUES ($1,$2, false)';
      result = yield pgClient.queryPromise(queryString, [migration.name, migration.migration]);
      yield migrate(migration, dbUrl);
    } else if (result.rows[0].migration !== migration.migration || (result.rows[0].ran === false && result.rows[0].name === migration.name)) {
      console.log('Updating migration: ' + migration.name);
      queryString = 'UPDATE migrations SET migration=$2,ran=false where name=$1';
      result = yield pgClient.queryPromise(queryString, [migration.name, migration.migration]);
      yield migrate(migration, dbUrl);
    }
  } catch (err) {
    console.error("Could not add migration " + migration.name)
    console.error(err.stack);
  } finally {
    done();
  }
};


var runMigrations = function * (migrations, db) {
  var dbUrl = utils.createUrl(db);
  yield createMigrationsTable(dbUrl);

  for (var i = 0; i < migrations.length; i++) {
    yield addMigration(migrations[i], dbUrl);
  }
};

module.exports = {
  runMigrations: runMigrations,
};
