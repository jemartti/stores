var flake = require('simpleflake');
var assert = require('assert');

var createUrl = function (db) {
  assert(db.database && db.user && db.password, "You must pass a valid database, user and password");
  db.host = db.host || 'localhost';
  db.port = db.port || '5432';
  return "pg://" + db.user + ":" + db.password + "@" + db.host + ":" + db.port + "/" + db.database;
};

var generateNumber = function(){
  return flake().toString('base10');
};

module.exports = {
  createUrl: createUrl,
  generateNumber: generateNumber
};
