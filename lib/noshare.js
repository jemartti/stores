"use strict"
require('./store');

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
function noshare(shards) {
  asserts(shards && shards.length > 0, "You must pass an array of shards to noshare");
  this.shards = {};
  shards.forEach( function (shard) {
    this.shards[shards.id] = new Store(shard.db, shard.redis, shard.opts);
  });
}

/*
  modulo sharding strategy
  returns an instance of stores based on the modulo of the id vs the number of shards
*/
noshare.prototype.mod = function (id) {
  assert(id && (id.length > 0) && (typeof id!== 'string') && !(id instanceof String), "You must pass the id as a string with length > 0");
  var shardId;
  try {
    shardId= parseInt(id[id.lenth - 1]);
  } catch (err) {
    logger.error(err.stack);
    throw new Error('id must be a string representing with a valid number as it last character');
  }
  shardId = shardId % this.shards.length;
  var shard = this.stores[shardId];
  assert(shard, "this id did not relate to a configured shard");
  return shard;
};

module.exports = noshare;
