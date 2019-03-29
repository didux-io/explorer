#!/usr/bin/env node

require( './db' );
require( './db-stats' );

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const bodyParser = require('body-parser');

let config = {};
try {
  config = require('./config.json');
} catch (e) {
  if (e.code == 'MODULE_NOT_FOUND') {
    console.log('No config file found. Using default configuration... (config.example.json)');
    config = require('./config.example.json');
  } else {
    throw e;
    process.exit(1);
  }
}

const app = express();
app.set('port', process.env.PORT || 3000);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(`${__dirname}/public/favicon.ico`));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// app libraries
global.__lib = __dirname + '/lib/';

let fs = require('fs');

let config = {};

try {
    let configContents = fs.readFileSync('tools/config.json');
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

let Web3 = require('web3');
let web3 = new Web3(
    new Web3.providers.HttpProvider(
        'https://' + 
        config.gethAddress.toString() + 
        ':' + 
        config.gethPort.toString()
    )
);

let mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
let Transaction = mongoose.model('Transaction');
let BlockStats = mongoose.model('BlockStat');
let MinedBlocksCount = mongoose.model('MinedBlocksCount');

app.get("/stats", async function (req, res) {
    let blockStats = await BlockStats.find({});
    let totalAverageTime = 0;
    let amountOfBlocksProcessed = 0;
    blockStats.forEach(blockStat => {
        totalAverageTime += blockStat.blockTime;
        amountOfBlocksProcessed++;
    });
    let averageBlockTimeInSec = totalAverageTime / amountOfBlocksProcessed;
    let latestBlock = await web3.eth.getBlock("latest").number;
    let totalXsmCreated = getTotalXsmCreated(latestBlock);

    let minedBlocksCountResult = await MinedBlocksCount.findOne({type: "global"});

    res.send({
        lastBlock: latestBlock,
        totalXsm: totalXsmCreated,
        totalTransactions: minedBlocksCountResult ? minedBlocksCountResult.amount : 0,
        averageBlockTimeInSecLast1000Blocks: isNaN(averageBlockTimeInSec) ? "-1" : averageBlockTimeInSec.toFixed(2),
        gasPrice: web3.eth.gasPrice
    });
});

// https://github.com/Smilo-platform/Wiki/wiki/Masternode-block-reward
function getTotalXsmCreated(totalBlocks) {
    if(totalBlocks >= 3200000000)
        totalBlocks = 3200000000;

    let increments = [{ blocks: 1,   reward: 4 },
    { blocks: 20000001,   reward: 2 },
    { blocks: 40000001,   reward: 1.75 },
    { blocks: 60000001,   reward: 1.5 },
    { blocks: 80000001,  reward: 1.25 },
    { blocks: 100000001,  reward: 1.0 },
    { blocks: 120000001,  reward: 0.8 },
    { blocks: 140000001,  reward: 0.6 },
    { blocks: 160000001,  reward: 0.4 },
    { blocks: 180000001,  reward: 0.2 },
    { blocks: 200000001,  reward: 0.1 },
    { blocks: 400000001,  reward: 0.05 },
    { blocks: 800000001, reward: 0.025 },
    { blocks: 1600000001, reward: 0.0125 }];

    let totalXsmCreated = increments.reverse().reduce((previous, increment) => {
        let reward = 0;
        let blocks = previous.blocks;
        if (previous.blocks >= increment.blocks) {
            let blocksInSection = previous.blocks - (increment.blocks - 1);
            reward = blocksInSection * increment.reward;
            blocks = increment.blocks - 1;
        }

        return {
            reward: previous.reward + reward,
            blocks: blocks
        }
    }, {reward: 0, blocks: totalBlocks});

    return totalXsmCreated.reward;
}

global.__lib = `${__dirname}/lib/`;

// client

app.get('/', (req, res) => {
  res.render('index', config);
});

app.get('/config', (req, res) => {
  res.json(config.settings);
});

require('./routes')(app);

// let angular catch them
app.use((req, res) => {
  res.render('index', config);
});

// error handlers
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err,
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {},
  });
});

const http = require('http').Server(app);

http.listen(app.get('port'), '0.0.0.0', () => {
  console.log(`Express server listening on port ${app.get('port')}`);
});
