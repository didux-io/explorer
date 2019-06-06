/*
  Tool for calculating block stats
*/

var Web3 = require('web3');

var mongoose = require( 'mongoose' );
var BlockStat = require( '../db-stats.js' ).BlockStat;

var updateStats = function(config) {
    var web3 = new Web3(new Web3.providers.HttpProvider('https://' + config.gethAddress.toString() + ':' +
    config.gethPort.toString())); 

    mongoose.connect( 'mongodb://localhost/blockDB' );
    mongoose.set('debug', true);

    var latestBlock = web3.eth.blockNumber;
    getStats(web3, latestBlock, null, latestBlock - 1000);
}


var getStats = function(web3, blockNumber, nextBlock, endBlock) {
    if (blockNumber <= endBlock)
        process.exit(9);

    if(web3.isConnected()) {

        web3.eth.getBlock(blockNumber, true, function(error, blockData) {
            if(error) {
                console.log('Warning: error on getting block with hash/number: ' +
                    blockNumber + ': ' + error);
            }
            else if(blockData == null) {
                console.log('Warning: null block data received from the block with hash/number: ' +
                    blockNumber);
            }
            else {
                if (nextBlock)
                    checkBlockDBExistsThenWrite(web3, blockData, nextBlock.timestamp);
                else
                    checkBlockDBExistsThenWrite(web3, blockData, parseInt(Date.now()/1000));
            }
        });
    } else {
        console.log('Error: Aborted due to web3 is not connected when trying to ' +
            'get block ' + blockNumber);
        process.exit(9);
    }
}

/**
  * Checks if the a record exists for the block number 
  *     if record exists: abort
  *     if record DNE: write a file for the block
  */
var checkBlockDBExistsThenWrite = function(web3, blockData, nextTime) {
    BlockStat.find({number: blockData.number}, function (err, b) {
        if (!b.length) {
            // calc hashrate, txCount, blocktime, uncleCount
            var stat = {
                "number": blockData.number,
                "timestamp": blockData.timestamp,
                "difficulty": blockData.difficulty,
                "txCount": blockData.transactions.length,
                "gasUsed": blockData.gasUsed,
                "gasLimit": blockData.gasLimit,
                "miner": blockData.miner,
                "blockTime": nextTime - blockData.timestamp,
                "uncleCount": blockData.uncles.length
            }
            new BlockStat(stat).save( function( err, s, count ){
                console.log(s)
                if ( typeof err !== 'undefined' && err ) {
                   console.log('Error: Aborted due to error on ' + 
                        'block number ' + blockData.number.toString() + ': ' + 
                        err);
                   process.exit(9);
                } else {
                    console.log('DB successfully written for block number ' +
                        blockData.number.toString() );    
                    getStats(web3, blockData.number - 1, blockData);     
                }
            });
        } else {
            console.log('Aborting because block number: ' + blockData.number.toString() + 
                ' already exists in DB.');
            return;
        }

    })
}

/** On Startup **/
// geth --rpc --rpcaddr "localhost" --rpcport "8545"  --rpcapi "eth,net,web3"

var minutes = 1;
// minutes * 60 * 1000;
statInterval = minutes * 60 * 1000;

console.log('statInterval:', statInterval);

var fs = require('fs');
var config = {};

try {
    var configContents = fs.readFileSync('config.json');
    config = JSON.parse(configContents);
}
catch (error) {
    if (error.code === 'ENOENT') {
        console.log('No config file found. Using default configuration (will ' + 
            'download all blocks starting from latest)');
    }
    else {
        throw error;
        process.exit(1);
    }
}

// set the default geth address if it's not provided
if (!('gethAddress' in config) || (typeof config.gethAddress) !== 'string') {
    config.gethAddress = "localhost"; // default
}

// set the default geth port if it's not provided
if (!('gethPort' in config) || (typeof config.gethPort) !== 'number') {
    config.gethPort = 8545; // default
}

// set the default output directory if it's not provided
if (!('output' in config) || (typeof config.output) !== 'string') {
    config.output = '.'; // default this directory
}

// set the default blocks if it's not provided
if (!('blocks' in config) || !(Array.isArray(config.blocks))) {
    config.blocks = [];
    config.blocks.push({'start': 0, 'end': 'latest'});
}

console.log('Using configuration:');
console.log(config);

setInterval(function() {
  updateStats(config);
}, statInterval);
