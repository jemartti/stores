"use strict"
var assert = require('assert');
var Store = require('./store');

/*
each shard must be of the format given below, this instantiates a number
of store instances mapped to the id given in the shard
{
 db: {
   host: 'localhost',
   username: 'testy',
   password: 'testy123',
   database: 'test'
 },
 redis: {
   host: 'localhost',
   port: 6379
 },
 opts: {
   cache: true,
   transaction: true
 }
 id: 1
}
*/
function Shards(shards) {
  assert(shards && shards.length > 0, "You must pass an array of shards to noshare");
  this.shards = {};
  this.numShards = shards.length;
  var _this = this;
  shards.forEach( function (shard) {
    _this.shards[shard.id] = new Store(shard.db, shard.redis, shard.opts);
  });
}

/*
  modulo sharding strategy
  returns an instance of stores based on the modulo of the id vs the number of shards
*/
Shards.prototype.mod = function (id) {
  assert(id && ((typeof id === 'string') || (id instanceof String)), "You must pass the id as a string");
  var shardId;
  try {
    shardId = parseInt(id.charAt(id.lenth - 1));
  } catch (err) {
    logger.error(err.stack);
    throw new Error('id must be a string representing with a valid number as it last character');
  }
  shardId = shardId % this.numShards;
  var shard = this.shards[shardId];
  assert(shard, "this id did not relate to a configured shard");
  return shard;
};

module.exports = Shards;
