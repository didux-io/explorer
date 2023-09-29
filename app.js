#!/usr/bin/env node

require('./db');

const express = require('express');
const path = require('path');
const cors = require('cors');
const favicon = require('serve-favicon');
const logger = require('morgan');
const bodyParser = require('body-parser');

let config = {};
try {
  config = require('./config.json');
} catch (e) {
  console.error('Error:', error);
  process.exit(1);
}

if (!config.nodeAddr && config.nodes) {
  config.nodeAddr = config.nodes[Math.floor(Math.random() * config.nodes.length)];
} else {
  console.error('No node configured');
  process.exit(1);
}

const app = express();
app.set('port', process.env.PORT || 3000);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(`${__dirname}/public/favicon.png`));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({ credentials: false, origin: true }));

console.log('Using configuration:');
console.log(config);

const Web3 = require('web3');

let web3 = new Web3(new Web3.providers.WebsocketProvider(`${config.nodeAddr}`));

const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

const BlockStats = mongoose.model('BlockStat');
const MinedBlocksCount = mongoose.model('MinedBlocksCount');

app.get('/stats', async (req, res) => {
  const blockStats = await BlockStats.find({});
  let totalAverageTime = 0;
  let amountOfBlocksProcessed = 0;
  blockStats.forEach((blockStat) => {
    totalAverageTime += blockStat.blockTime;
    amountOfBlocksProcessed++;
  });
  const averageBlockTimeInSec = totalAverageTime / amountOfBlocksProcessed;
  const latestBlockObj = await web3.eth.getBlock('latest');
  const latestBlockNumber = latestBlockObj.number;
  const totalXsmCreated = getTotalXsmCreated(latestBlockNumber);

  const minedBlocksCountResult = await MinedBlocksCount.findOne({ type: 'global' });

  const gasPrice = await web3.eth.getGasPrice();

  res.send({
    lastBlock: latestBlockNumber,
    current_supply: totalXsmCreated,
    totalTransactions: minedBlocksCountResult ? minedBlocksCountResult.amount : 0,
    averageBlockTimeInSecLast1000Blocks: isNaN(averageBlockTimeInSec) ? '-1' : averageBlockTimeInSec.toFixed(2),
    gasPrice,
  });
});

const keepAlive = setInterval(async () => {
  try {
    console.log('Keep alive request - app.js');
    console.log(await web3.eth.getNodeInfo());
  } catch (error) {
    console.log('Error in keep alive ws request. Reconnecting to node - app.js');
    web3 = new Web3(new Web3.providers.WebsocketProvider(`${config.nodeAddr}`));
  }
}, 60 * 1000);

// https://github.com/Smilo-platform/Wiki/wiki/Masternode-block-reward
function getTotalXsmCreated(totalBlocks) {
  if (totalBlocks >= 3200000000) totalBlocks = 3200000000;

  const increments = [{ blocks: 1, reward: 4 },
    { blocks: 20000000, reward: 2 },
    { blocks: 40000000, reward: 1.75 },
    { blocks: 60000000, reward: 1.5 },
    { blocks: 80000000, reward: 1.25 },
    { blocks: 100000000, reward: 1.0 },
    { blocks: 120000000, reward: 0.8 },
    { blocks: 140000000, reward: 0.6 },
    { blocks: 160000000, reward: 0.4 },
    { blocks: 180000000, reward: 0.2 },
    { blocks: 200000000, reward: 0.1 },
    { blocks: 400000000, reward: 0.05 },
    { blocks: 800000000, reward: 0.025 }];

  const totalXsmCreated = increments.reverse().reduce((previous, increment) => {
    let reward = 0;
    let { blocks } = previous;
    if (previous.blocks >= increment.blocks) {
      const blocksInSection = previous.blocks - (increment.blocks - 1);
      reward = blocksInSection * increment.reward;
      blocks = increment.blocks - 1;
    }

    return {
      reward: previous.reward + reward,
      blocks,
    };
  }, { reward: 0, blocks: totalBlocks });

  // Increment calculation with pre-mined Foundation tokens
  totalXsmCreated.reward += 80000000;

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
