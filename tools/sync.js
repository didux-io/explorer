/*
Name: Ethereum Blockchain syncer
Version: .0.0.2
This file will start syncing the blockchain from the node address you provide in the conf.json file.
Please read the README in the root directory that explains the parameters of this code
*/
require('../db.js');
const BigNumber = require('bignumber.js');
const _ = require('lodash');

const asyncL = require('async');
const Web3 = require('web3');

const ERC20ABI = require('human-standard-token-abi');

const fetch = require('node-fetch');
const abiDecoder = require('abi-decoder');

const mongoose = require('mongoose');
const etherUnits = require('../lib/etherUnits.js');
const { Market } = require('../db.js');

const Block = mongoose.model('Block');
const Transaction = mongoose.model('Transaction');
const InternalTransaction = mongoose.model('InternalTransaction');
const Account = mongoose.model('Account');
const Contract = mongoose.model('Contract');
const TokenTransfer = mongoose.model('TokenTransfer');
const MinedBlocksCount = mongoose.model('MinedBlocksCount');

const ERC20_METHOD_DIC = { '0xa9059cbb': 'transfer', '0xa978501e': 'transferFrom', '0xad544c30': 'endRound' };

/**
  Start config for node connection and sync
**/
/**
 * nodeAddr: node address
 * wsPort:  rpc port
 * bulkSize: size of array in block to use bulk operation
 */
// load config.json
const config = { nodeAddr: 'localhost', wsPort: 8546, bulkSize: 100 };
try {
  var local = require('../config.json');
  _.extend(config, local);
  console.log('config.json found.');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    var local = require('../config.example.json');
    _.extend(config, local);
    console.log('No config file found. Using default configuration... (config.example.json)');
  } else {
    throw error;
    process.exit(1);
  }
}

console.log(`Connecting ${config.nodeAddr}:${config.wsPort}...`);
// Sets address for RPC WEB3 to connect to, usually your node IP address defaults ot localhost
let web3 = new Web3(new Web3.providers.WebsocketProvider(`wss://${config.nodeAddr}:${config.wsPort.toString()}`));
if (web3.eth.net.isListening()) console.log('sync - Web3 connection established');
else throw 'sync - No connection, please specify web3host in conf.json';

const normalizeTX = async (txData, receipt, blockData) => {
  const tx = {
    blockHash: txData.blockHash,
    blockNumber: txData.blockNumber,
    from: txData.from.toLowerCase(),
    hash: txData.hash.toLowerCase(),
    value: etherUnits.toEther(new BigNumber(txData.value), 'wei'),
    nonce: txData.nonce,
    r: txData.r,
    s: txData.s,
    v: txData.v,
    gas: txData.gas,
    gasUsed: receipt.gasUsed,
    gasPrice: String(txData.gasPrice),
    input: txData.input,
    transactionIndex: txData.transactionIndex,
    timestamp: blockData.timestamp,
  };

  if (receipt.status) {
    tx.status = receipt.status;
  }

  if (txData.to) {
    tx.to = txData.to.toLowerCase();
    return tx;
  } else if (txData.creates) {
    tx.creates = txData.creates.toLowerCase();
    return tx;
  } else {
    tx.creates = receipt.contractAddress.toLowerCase();
    return tx;
  }
};

/**
  Write the whole block object to DB
**/
var writeBlockToDB = function (config, blockData, flush) {
  const self = writeBlockToDB;
  if (!self.bulkOps) {
    self.bulkOps = [];
  }
  if (blockData && blockData.number >= 0) {
    blockData.blockReward = getBlockReward(blockData.number);
    self.bulkOps.push(new Block(blockData));
    if (!('quiet' in config && config.quiet === true)) {
      console.log(`\t- block #${blockData.number.toString()} inserted.`);
    }
    MinedBlocksCount.findOneAndUpdate(
        {   // Filter
            address: blockData.miner
        }, 
        {   // Update
            $inc: {
                amount: 1
            },
            type: "address"
        },
        {   // Options
            upsert: true,
            new: true
        },  
        (   // Callback
            err, 
            tx
        ) => { // Return
            
        }
    );
  }

  if (flush && self.bulkOps.length > 0 || self.bulkOps.length >= config.bulkSize) {
    const bulk = self.bulkOps;
    self.bulkOps = [];
    if (bulk.length === 0) return;

    Block.collection.insert(bulk, (err, blocks) => {
      if (typeof err !== 'undefined' && err) {
        if (err.code === 11000) {
          if (!('quiet' in config && config.quiet === true)) {
            console.log(`Skip: Duplicate DB key : ${err}`);
          }
        } else {
          console.log(`Error: Aborted due to error on DB: ${err}`);
          process.exit(9);
        }
      } else {
        if (!('quiet' in config && config.quiet === true)) {
          console.log(`* ${blocks.insertedCount} blocks successfully written.`);
        }
      }
    });
  }
};
let getBlockReward = function(b) {
  if (b > 0 && b < 20000001) {
      return 4;
  } else if (b > 20000000 && b < 40000001) {
      return 2;
  } else if (b > 40000000 && b < 60000001) {
      return 1.75;
  } else if (b > 60000000 && b < 80000001) {
      return 1.5;
  } else if (b > 80000000 && b < 100000001) {
      return 1.25;
  } else if (b > 100000000 && b < 120000001) {
      return 1.0;
  } else if (b > 120000000 && b < 140000001) {
      return 0.8;
  } else if (b > 140000000 && b < 160000001) {
      return 0.6;
  } else if (b > 160000000 && b < 180000001) {
      return 0.4;
  } else if (b > 180000000 && b < 200000001) {
      return 0.2;
  } else if (b > 200000000 && b < 400000001) {
      return 0.1;
  } else if (b > 400000000 && b < 800000001) {
      return 0.05;
  } else if (b > 800000000 && b < 1600000001) {
      return 0.025;
  } else if (b > 1600000000 && b < 3200000001) {
      return 0.0125;
  } 
}
/**
  Break transactions out of blocks and write to DB
**/
const writeTransactionsToDB = async (config, blockData, flush) => {
  const self = writeTransactionsToDB;
  if (!self.bulkOps) {
    self.bulkOps = [];
    self.blocks = 0;
  }
  // save miner addresses
  if (!self.miners) {
    self.miners = [];
  }
  if (blockData) {
    self.miners.push({ address: blockData.miner, blockNumber: blockData.number, type: 0 });
  }
  if (blockData && blockData.transactions.length > 0) {
    console.log('blockData:', blockData);
    for (d in blockData.transactions) {
      console.log('d:', d);
      const txData = blockData.transactions[d];
      const receipt = await web3.eth.getTransactionReceipt(txData.hash);
      const tx = await normalizeTX(txData, receipt, blockData);
      // Contact creation tx, Event logs of internal transaction
      if (txData.input && txData.input.length > 2) {
        console.log('writeTransactionsToDB HAS INPUT');
        // Contact creation tx
        if (txData.to === null) {
          console.log('writeTransactionsToDB IF');
          // Support Parity & Geth case
          if (txData.creates) {
            contractAddress = txData.creates.toLowerCase();
          } else {
            contractAddress = receipt.contractAddress.toLowerCase();
          }
          const contractdb = {};
          let isTokenContract = true;
          const Token = new web3.eth.Contract(ERC20ABI, contractAddress);
          contractdb.owner = txData.from;
          contractdb.blockNumber = blockData.number;
          contractdb.creationTransaction = txData.hash;
          try {
            const call = await web3.eth.call({ to: contractAddress, data: web3.utils.sha3('totalSupply()') });
            if (call === '0x') {
              isTokenContract = false;
            } else {
              try {
                // ERC20 & ERC223 Token Standard compatible format
                contractdb.tokenName = await Token.methods.name().call();
                contractdb.decimals = await Token.methods.decimals().call();
                contractdb.symbol = await Token.methods.symbol().call();
                contractdb.totalSupply = await Token.methods.totalSupply().call();
              } catch (err) {
                isTokenContract = false;
              }
            }
          } catch (err) {
            isTokenContract = false;
          }
          contractdb.byteCode = await web3.eth.getCode(contractAddress);
          if (isTokenContract) {
            contractdb.ERC = 2;
          } else {
            // Normal Contract
            contractdb.ERC = 0;
          }
          // Write to db
          Contract.update(
            { address: contractAddress },
            { $setOnInsert: contractdb },
            { upsert: true },
            (err, data) => {
              if (err) {
                console.log(err);
              }
            },
          );
        } else {
          console.log('writeTransactionsToDB ELSE');
          // Internal transaction  . write to doc of InternalTx
          const transfer = {
            'hash': '', 'blockNumber': 0, 'from': '', 'to': '', 'contract': '', 'value': 0, 'timestamp': 0,
          };
          const methodCode = txData.input.substr(0, 10);
          console.log('methodCode:', methodCode);
          console.log('txData.input:', txData.input);
          if (ERC20_METHOD_DIC[methodCode] === 'transfer' || ERC20_METHOD_DIC[methodCode] === 'transferFrom' || ERC20_METHOD_DIC[methodCode] === 'endRound') {
            if (ERC20_METHOD_DIC[methodCode] === 'transfer') {
              // Token transfer transaction
              transfer.from = txData.from;
              transfer.to = `0x${txData.input.substring(34, 74)}`;
              transfer.value = Number(`0x${txData.input.substring(74)}`);
              transfer.method = ERC20_METHOD_DIC[methodCode];
              transfer.hash = txData.hash;
              transfer.blockNumber = blockData.number;
              transfer.contract = txData.to;
              transfer.timestamp = blockData.timestamp;
              // Write transfer transaction into db
              TokenTransfer.update(
                { hash: transfer.hash },
                { $setOnInsert: transfer },
                { upsert: true },
                (err, data) => {
                  if (err) {
                    console.log(err);
                  }
                },
              );
            } else if (ERC20_METHOD_DIC[methodCode] === 'transferFrom') {
              // transferFrom
              transfer.from = `0x${txData.input.substring(34, 74)}`;
              transfer.to = `0x${txData.input.substring(74, 114)}`;
              transfer.value = Number(`0x${txData.input.substring(114)}`);
              transfer.method = ERC20_METHOD_DIC[methodCode];
              transfer.hash = txData.hash;
              transfer.blockNumber = blockData.number;
              transfer.contract = txData.to;
              transfer.timestamp = blockData.timestamp;
              // Write transfer transaction into db
              TokenTransfer.update(
                { hash: transfer.hash },
                { $setOnInsert: transfer },
                { upsert: true },
                (err, data) => {
                  if (err) {
                    console.log(err);
                  }
                },
              );
            } else if (ERC20_METHOD_DIC[methodCode] === 'endRound') {
              console.log('Quake txData:', txData);
              console.log('Quake txData.input:', txData.input);
              // Internal transaction; Quake endRound
              const decodedData = abiDecoder.decodeMethod(txData.input);
              const internalTransactionsAddresses = decodedData.params[0].value;
              const internalTransactionsValues = decodedData.params[1].value;

              console.log('internalTransactionsValues:', internalTransactionsValues);
              console.log('internalTransactionsAddresses:', internalTransactionsAddresses);
              for (let i = 0; i < internalTransactionsAddresses.length; i++) {
                txData.value = etherUnits.toEther(new BigNumber(internalTransactionsValues[i]), 'wei');
                console.log('txData.value:', txData.value);
                txData.to = internalTransactionsAddresses[i];
                txData.from = tx.to;
                txData.method = ERC20_METHOD_DIC[methodCode];
                txData.hash = txData.hash;
                txData.blockNumber = blockData.number;
                txData.contract = txData.to;
                txData.timestamp = blockData.timestamp;
                delete txData._id;
                console.log('Adding internal transaction: ', txData);
                // Add to internal transactions
                InternalTransaction.collection.insert(txData, (err, tx) => {
                  console.log('InternalTransaction.collection.insert err:', err);
                  console.log('InternalTransaction.collection.insert tx:', tx);
                  if (typeof err !== 'undefined' && err) {
                    if (err.code === 11000) {
                      if (!('quiet' in config && config.quiet === true)) {
                        console.log(`Skip: Duplicate transaction key ${err}`);
                      }
                    } else {
                      console.log(`Error: Aborted due to error on InternalTransaction: ${err}`);
                      process.exit(9);
                    }
                  } else {
                    if (!('quiet' in config && config.quiet === true)) {
                      console.log(`* ${tx.insertedCount} internal transactions successfully recorded.`);
                    }
                  }
                });
              }
            }
          }
        }
      }
      self.bulkOps.push(tx);
    }
    if (!('quiet' in config && config.quiet === true)) {
      console.log(`\t- block #${blockData.number.toString()}: ${blockData.transactions.length.toString()} transactions recorded.`);
    }
  }
  self.blocks++;

  if (flush && self.blocks > 0 || self.blocks >= config.bulkSize) {
    const bulk = self.bulkOps;
    self.bulkOps = [];
    self.blocks = 0;
    const { miners } = self;
    self.miners = [];

    // setup accounts
    const data = {};
    bulk.forEach((tx) => {
      data[tx.from] = { address: tx.from, blockNumber: tx.blockNumber, type: 0 };
      if (tx.to) {
        data[tx.to] = { address: tx.to, blockNumber: tx.blockNumber, type: 0 };
      }
    });

    // setup miners
    miners.forEach((miner) => {
      data[miner.address] = miner;
    });

    const accounts = Object.keys(data);

    if (bulk.length === 0 && accounts.length === 0) return;

    // update balances
    if (config.settings.useRichList && accounts.length > 0) {
      asyncL.eachSeries(accounts, (account, eachCallback) => {
        const { blockNumber } = data[account];
        // get contract account type
        web3.eth.getCode(account, (err, code) => {
          if (err) {
            console.log(`ERROR: fail to getCode(${account})`);
            return eachCallback(err);
          }
          if (code.length > 2) {
            data[account].type = 1; // contract type
          }

          web3.eth.getBalance(account, blockNumber, (err, balance) => {
            if (err) {
              console.log(err);
              console.log(`ERROR: fail to getBalance(${account})`);
              return eachCallback(err);
            }

            data[account].balance = parseFloat(web3.utils.fromWei(balance, 'ether'));
            eachCallback();
          });
        });
      }, (err) => {
        let n = 0;
        accounts.forEach((account) => {
          n++;
          if (!('quiet' in config && config.quiet === true)) {
            if (n <= 5) {
              console.log(` - upsert ${account} / balance = ${data[account].balance}`);
            } else if (n === 6) {
              console.log(`   (...) total ${accounts.length} accounts updated.`);
            }
          }
          // upsert account
          Account.collection.update({ address: account }, { $set: data[account] }, { upsert: true });
        });
      });
    }

    if (bulk.length > 0) {
      Transaction.collection.insert(bulk, (err, tx) => {
        if (typeof err !== 'undefined' && err) {
          if (err.code === 11000) {
            if (!('quiet' in config && config.quiet === true)) {
              console.log(`Skip: Duplicate transaction key ${err}`);
            }
          } else {
            console.log(`Error: Aborted due to error on Transaction: ${err}`);
            process.exit(9);
          }
        } else {
          if (!('quiet' in config && config.quiet === true)) {
            console.log(`* ${tx.insertedCount} transactions successfully recorded.`);
          }
        }
      });
      MinedBlocksCount.findOneAndUpdate(
        {   // Filter
            type: "global"
        }, 
        {   // Update
            $inc: {
                amount: bulk.length
            }
        },
        {   // Options
            upsert: true,
            new: true
        },  
        (   // Callback
            err, 
            tx
        ) => { // Return
            
        }
      );
    }
  }
};
/**
  //Just listen for latest blocks and sync from the start of the app.
**/
const listenBlocks = function (config) {
  const newBlocks = web3.eth.subscribe('newBlockHeaders', (error, result) => {
    if (!error) {
      return;
    }

    console.error(error);
  });
  newBlocks.on('data', (blockHeader) => {
    web3.eth.getBlock(blockHeader.hash, true, (error, blockData) => {
      if (blockHeader === null) {
        console.log('Warning: null block hash');
      } else {
        writeBlockToDB(config, blockData, true);
        writeTransactionsToDB(config, blockData, true);
      }
    });
  });
  newBlocks.on('error', console.error);
};
/**
  If full sync is checked this function will start syncing the block chain from lastSynced param see README
**/
var syncChain = function (config, nextBlock) {
  if (web3.eth.net.isListening()) {
    if (typeof nextBlock === 'undefined') {
      prepareSync(config, (error, startBlock) => {
        if (error) {
          console.log(`ERROR: error: ${error}`);
          return;
        }
        syncChain(config, startBlock);
      });
      return;
    }

    if (nextBlock === null) {
      console.log('nextBlock is null');
      return;
    } if (nextBlock < config.startBlock) {
      writeBlockToDB(config, null, true);
      writeTransactionsToDB(config, null, true);
      console.log('*** Sync Finished ***');
      config.syncAll = false;
      return;
    }

    let count = config.bulkSize;
    while (nextBlock >= config.startBlock && count > 0) {
      web3.eth.getBlock(nextBlock, true, (error, blockData) => {
        if (error) {
          console.log(`Warning (syncChain): error on getting block with hash/number: ${nextBlock}: ${error}`);
        } else if (blockData === null) {
          console.log(`Warning: null block data received from the block with hash/number: ${nextBlock}`);
        } else {
          writeBlockToDB(config, blockData);
          writeTransactionsToDB(config, blockData);
        }
      });
      nextBlock--;
      count--;
    }

    setTimeout(() => { syncChain(config, nextBlock); }, 500);
  } else {
    console.log(`Error: Web3 connection time out trying to get block ${nextBlock} retrying connection now`);
    syncChain(config, nextBlock);
  }
};
/**
  //check oldest block or starting block then callback
**/
const prepareSync = async (config, callback) => {
  let blockNumber = null;
  const oldBlockFind = Block.find({}, 'number').lean(true).sort('number').limit(1);
  oldBlockFind.exec(async (err, docs) => {
    if (err || !docs || docs.length < 1) {
      // not found in db. sync from config.endBlock or 'latest'
      if (web3.eth.net.isListening()) {
        const currentBlock = await web3.eth.getBlockNumber();
        const latestBlock = config.endBlock || currentBlock || 'latest';
        console.log('config.endBlock:', config.endBlock);
        if (latestBlock === 'latest') {
          console.log('End block is set to latest!');
          web3.eth.getBlock(latestBlock, true, (error, blockData) => {
            if (error) {
              console.log(`Warning (prepareSync): error on getting block with hash/number: ${latestBlock}: ${error}`);
            } else if (blockData === null) {
              console.log(`Warning: null block data received from the block with hash/number: ${latestBlock}`);
            } else {
              console.log(`1. Starting block number = ${blockData.number}`);
              if ('quiet' in config && config.quiet === true) {
                console.log('Quiet mode enabled');
              }
              blockNumber = blockData.number - 1;
              callback(null, blockNumber);
            }
          });
        } else {
          console.log(`2. Starting block number = ${latestBlock}`);
          if ('quiet' in config && config.quiet === true) {
            console.log('Quiet mode enabled');
          }
          blockNumber = latestBlock - 1;
          callback(null, blockNumber);
        }
      } else {
        console.log('Error: Web3 connection error');
        callback(err, null);
      }
    } else {
      blockNumber = docs[0].number - 1;
      console.log(`Old block found. Starting block number = ${blockNumber}`);
      if ('quiet' in config && config.quiet === true) {
        console.log('Quiet mode enabled');
      }
      callback(null, blockNumber);
    }
  });
};
/**
  Block Patcher(experimental)
**/
const runPatcher = async (config, startBlock, endBlock) => {
  if (!web3 || !web3.eth.net.isListening()) {
    console.log('Error: Web3 is not connected. Retrying connection shortly...');
    setTimeout(() => { runPatcher(config); }, 3000);
    return;
  }

  if (typeof startBlock === 'undefined' || typeof endBlock === 'undefined') {
    // get the last saved block
    const blockFind = Block.find({}, 'number').lean(true).sort('-number').limit(1);
    blockFind.exec(async (err, docs) => {
      if (err || !docs || docs.length < 1) {
        // no blocks found. terminate runPatcher()
        console.log('No need to patch blocks.');
        return;
      }

      const lastMissingBlock = docs[0].number + 1;
      const currentBlock = await web3.eth.getBlockNumber();
      runPatcher(config, lastMissingBlock, currentBlock - 1);
    });
    return;
  }

  const missingBlocks = endBlock - startBlock + 1;
  if (missingBlocks > 0) {
    if (!('quiet' in config && config.quiet === true)) {
      console.log(`Patching from #${startBlock} to #${endBlock}`);
    }
    let patchBlock = startBlock;
    let count = 0;
    while (count < config.patchBlocks && patchBlock <= endBlock) {
      if (!('quiet' in config && config.quiet === true)) {
        console.log(`Patching Block: ${patchBlock}`);
      }
      web3.eth.getBlock(patchBlock, true, (error, patchData) => {
        if (error) {
          console.log(`Warning: error on getting block with hash/number: ${patchBlock}: ${error}`);
        } else if (patchData === null) {
          console.log(`Warning: null block data received from the block with hash/number: ${patchBlock}`);
        } else {
          checkBlockDBExistsThenWrite(config, patchData);
        }
      });
      patchBlock++;
      count++;
    }
    // flush
    writeBlockToDB(config, null, true);
    writeTransactionsToDB(config, null, true);

    setTimeout(() => { runPatcher(config, patchBlock, endBlock); }, 1000);
  } else {
    // flush
    writeBlockToDB(config, null, true);
    writeTransactionsToDB(config, null, true);

    console.log('*** Block Patching Completed ***');
  }
};
/**
  This will be used for the patcher(experimental)
**/
var checkBlockDBExistsThenWrite = function (config, patchData, flush) {
  Block.find({ number: patchData.number }, (err, b) => {
    if (!b.length) {
      writeBlockToDB(config, patchData, flush);
      writeTransactionsToDB(config, patchData, flush);
    } else if (!('quiet' in config && config.quiet === true)) {
      console.log(`Block number: ${patchData.number.toString()} already exists in DB.`);
    }
  });
};
/**
  Fetch market price from cryptocompare
**/
// 10 minutes
const quoteInterval = 10 * 60 * 1000;

const getQuote = async () => {
  const options = {
    timeout: 10000,
  };
  const URL = `https://min-api.cryptocompare.com/data/price?fsym=${config.settings.symbol}&tsyms=USD`;

  try {
    const requestUSD = await fetch(URL);
    const quoteUSD = await requestUSD.json();

    quoteObject = {
      timestamp: Math.round(Date.now() / 1000),
      quoteUSD: quoteUSD.USD,
    };

    new Market(quoteObject).save((err, market, count) => {
      if (typeof err !== 'undefined' && err) {
        process.exit(9);
      } else {
        if (!('quiet' in config && config.quiet === true)) {
          console.log('DB successfully written for market quote.');
        }
      }
    });
  } catch (error) {
    if (!('quiet' in config && config.quiet === true)) {
      console.log(error);
    }
  }
};

// patch missing blocks
if (config.patch === true) {
  console.log('Checking for missing blocks');
  runPatcher(config);
}

// check NORICHLIST env
// you can use it like as 'NORICHLIST=1 node tools/sync.js' to disable balance updater temporary.
if (process.env.NORICHLIST) {
  config.settings.useRichList = false;
}

// Start listening for latest blocks
listenBlocks(config);

// Two players
const input = '0xad544c30000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000577db2f2e42388109be8fb2048b2c339cb79a6c40000000000000000000000002ec3a912b3815c676064fb823bcf0c584809eda2000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000031f5c4ed27680000000000000000000000000000000000000000000000000000214e8348c4f00000';

// Two players
const input2 ='0xad544c30000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000020000000000000000000000002ec3a912b3815c676064fb823bcf0c584809eda2000000000000000000000000577db2f2e42388109be8fb2048b2c339cb79a6c4000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000031f5c4ed27680000000000000000000000000000000000000000000000000000214e8348c4f00000';

// One player
const input3 ='0xad544c30000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000577db2f2e42388109be8fb2048b2c339cb79a6c4000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000053444835ec580000';

// 0xad544c3
// 000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000


// Start at: 226
// 577db2f2e42388109be8fb2048b2c339cb79a6c4
// 000000000000000000000000
// 2ec3a912b3815c676064fb823bcf0c584809eda2
// 0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000


// 31f5c4ed27680000
// 000000000000000000000000000000000000000000000000
// 214e8348c4f00000

// Starts full sync when set to true in config
if (config.syncAll === true) {
  console.log('Starting Full Sync');
  syncChain(config);
}

// Start price sync on DB
if (config.settings.useFiat) {
  getQuote();

  setInterval(() => {
    getQuote();
  }, quoteInterval);
}

var keepAlive = setInterval(async function() {
    try {
      console.log('Keep alive request - sync.js');
      console.log(await web3.eth.getNodeInfo());
    } catch(error) {
      console.log('Error in keep alive ws request. Reconnecting to node - sync.js');
      web3 = new Web3(new Web3.providers.WebsocketProvider(`wss://${config.nodeAddr}:${config.wsPort.toString()}`));
    }
}, 300 * 1000);

// const value = web3.utils.hexToNumber('0x31f5c4ed27680000');

// const value = parseInt('0x31f5c4ed27680000', 16);

const testData = '0xad544c30000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000577db2f2e42388109be8fb2048b2c339cb79a6c40000000000000000000000002ec3a912b3815c676064fb823bcf0c584809eda2000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000031f5c4ed27680000000000000000000000000000000000000000000000000000214e8348c4f00000';

const abi = [
	{
		"constant": true,
		"inputs": [],
		"name": "getGameDetails",
		"outputs": [
			{
				"name": "",
				"type": "string"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "int256"
			},
			{
				"name": "",
				"type": "string"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"name": "contractName",
				"type": "string"
			},
			{
				"name": "deposit",
				"type": "int256"
			},
			{
				"name": "minimalParticipants",
				"type": "int256"
			},
			{
				"name": "firstReward",
				"type": "int256"
			},
			{
				"name": "secondReward",
				"type": "int256"
			},
			{
				"name": "thirdReward",
				"type": "int256"
			},
			{
				"name": "serverReward",
				"type": "int256"
			},
			{
				"name": "rewardType",
				"type": "string"
			}
		],
		"name": "setGameDetails",
		"outputs": [],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"name": "winnersAddresses",
				"type": "address[]"
			},
			{
				"name": "winnersAmounts",
				"type": "uint256[]"
			}
		],
		"name": "endRound",
		"outputs": [],
		"payable": true,
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [
			{
				"name": "participantAddress",
				"type": "address"
			}
		],
		"name": "isValidParticipant",
		"outputs": [
			{
				"name": "",
				"type": "bool"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": false,
		"inputs": [
			{
				"name": "participantAddress",
				"type": "address"
			}
		],
		"name": "addParticipant",
		"outputs": [],
		"payable": false,
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [],
		"name": "amountOfParticipants",
		"outputs": [
			{
				"name": "",
				"type": "uint256"
			}
		],
		"payable": false,
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"name": "owner",
				"type": "address"
			},
			{
				"name": "contractName",
				"type": "string"
			},
			{
				"name": "deposit",
				"type": "int256"
			},
			{
				"name": "minimalParticipants",
				"type": "int256"
			},
			{
				"name": "firstReward",
				"type": "int256"
			},
			{
				"name": "secondReward",
				"type": "int256"
			},
			{
				"name": "thirdReward",
				"type": "int256"
			},
			{
				"name": "serverReward",
				"type": "int256"
			},
			{
				"name": "rewardType",
				"type": "string"
			}
		],
		"payable": true,
		"stateMutability": "payable",
		"type": "constructor"
	},
	{
		"payable": true,
		"stateMutability": "payable",
		"type": "fallback"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"name": "winnersAddresses",
				"type": "address[]"
			},
			{
				"indexed": false,
				"name": "winnersAmounts",
				"type": "uint256[]"
			}
		],
		"name": "WinnersSummary",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "ContractReceivedFunds",
		"type": "event"
	}
];
abiDecoder.addABI(abi);

// const decodedData = abiDecoder.decodeMethod(testData);

// const winnersAddresses = decodedData.params[0].value;
// const winnersAmounts = decodedData.params[1].value;

// console.log('winnersAddresses:', winnersAddresses);
// console.log('winnersAmounts:', winnersAmounts);