/*
Name: Ethereum Blockchain syncer
Version: .0.0.2
This file will start syncing the blockchain from the node address you provide in the conf.json file.
Please read the README in the root directory that explains the parameters of this code
*/
require("../db.js");
const BigNumber = require("bignumber.js");
const _ = require("lodash");

const Web3 = require("web3");

const ERC20ABI = require("human-standard-token-abi");

const fetch = require("node-fetch");
const abiDecoder = require("abi-decoder");

const mongoose = require("mongoose");
const etherUnits = require("../lib/etherUnits.js");
const { Market } = require("../db.js");
const local = require("../config.json");
const Web3Provider = require("./web3Provider");

const Block = mongoose.model("Block");
const Transaction = mongoose.model("Transaction");
const InternalTransaction = mongoose.model("InternalTransaction");
const Account = mongoose.model("Account");
const Contract = mongoose.model("Contract");
const TokenTransfer = mongoose.model("TokenTransfer");
const MinedBlocksCount = mongoose.model("MinedBlocksCount");
const ERC20_METHOD_DIC = {
    "0xa9059cbb": "transfer",
    "0xa978501e": "transferFrom",
    "0xad544c30": "endRound",
};

/**
  Start config for node connection and sync
**/
/**
 * nodeAddr: node address
 * bulkSize: size of array in block to use bulk operation
 */
// load config.json
const config = { bulkSize: 100 };
let runner = 0;

try {
    const local = require("../config.json");
    _.extend(config, local);
    console.log("config.json found.");
} catch (error) {
    console.log("Error:", error);
    process.exit(1);
}

if (!config.nodeAddr && config.nodes) {
    config.nodeAddr =
        config.nodes[Math.floor(Math.random() * config.nodes.length)];
} else {
    console.error("No node configured");
    process.exit(1);
}

// console.log(`Connecting ${config.nodeAddr}...`);
// Sets address for RPC WEB3 to connect to, usually your node IP address defaults ot localhost
// let web3 = new Web3(new Web3.providers.WebsocketProvider(`${config.nodeAddr}`));

// Example usage:
const connectionUrls = ["http://37.59.131.19:22000"];
const httpWeb3 = new Web3(new Web3Provider(connectionUrls));
const web3 = new Web3(config.nodeAddr);
if (web3.eth.net.isListening()) {
    console.log("sync - Web3 connection established");
} else throw "sync - No connection, please specify web3host in conf.json";

const normalizeTX = async (txData, receipt, blockData) => {
    const tx = {
        blockHash: txData.blockHash,
        blockNumber: txData.blockNumber,
        from: txData.from.toLowerCase(),
        hash: txData.hash.toLowerCase(),
        value: etherUnits.toEther(new BigNumber(txData.value), "wei"),
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
    }
    tx.creates = receipt.contractAddress.toLowerCase();
    return tx;
};

let getBlockReward = function (b) {
    if (b >= 0 && b < 20000000) {
        return 4;
    }
    if (b >= 20000000 && b < 40000000) {
        return 2;
    }
    if (b >= 40000000 && b < 60000000) {
        return 1.75;
    }
    if (b >= 60000000 && b < 80000000) {
        return 1.5;
    }
    if (b >= 80000000 && b < 100000000) {
        return 1.25;
    }
    if (b >= 100000000 && b < 120000000) {
        return 1.0;
    }
    if (b >= 120000000 && b < 140000000) {
        return 0.8;
    }
    if (b >= 140000000 && b < 160000000) {
        return 0.6;
    }
    if (b >= 160000000 && b < 180000000) {
        return 0.4;
    }
    if (b >= 180000000 && b < 200000000) {
        return 0.2;
    }
    if (b >= 200000000 && b < 400000000) {
        return 0.1;
    }
    if (b >= 400000000 && b < 800000000) {
        return 0.05;
    }
    if (b >= 800000000 && b < 1600000000) {
        return 0.025;
    }
};

/**
  //Just listen for latest blocks and sync from the start of the app.
**/
const listenBlocks = function () {
    const newBlocks = web3.eth.subscribe("newBlockHeaders", (error, result) => {
        if (!error) {
            return;
        }
        console.error(error);
    });
    newBlocks.on("data", async (blockHeader) => {
        await fetchBlockFromChain(blockHeader.hash);
        await updateMinerMinedBlocks();
        await calculateTotalTransactions();
    });
    newBlocks.on("error", console.error);
};

/**
  If full sync is checked this function will start syncing the block chain from lastSynced param see README
**/
var quickSync = async function (config, nextBlock) {
    if (web3.eth.net.isListening()) {
        if (!nextBlock) {
            // Start from either the most recent block + 1 in the database.
            // Or start from scratch, at 0.
            const highestBlock = await Block.collection.findOne(
                {},
                { sort: { number: -1 } }
            );

            nextBlock = highestBlock?.number + 1 || config.startBlock;
        }
        const endBlock = await web3.eth.getBlockNumber();

        if (nextBlock >= endBlock) {
            await retryMissingBlocks();
            await updateMinerMinedBlocks();
            await calculateTotalTransactions();

            listenBlocks(config);
            return;
        }

        // console.log(`Start ${config.bulkSize - runner} tasks`);
        for (let i = runner; i < config.bulkSize; i++) {
            runner++;
            await fetchBlockFromChain(nextBlock);
            nextBlock++;
        }

        setTimeout(async () => {
            await quickSync(config, nextBlock);
        }, 500);
    } else {
        console.log(
            `Error: Web3 connection time out trying to get block ${nextBlock} retrying connection now`
        );
        await quickSync(config, nextBlock);
    }
};

async function updateBalancesFromGenesisBlock(blockData) {
    const session = await mongoose.startSession();
    try {
        console.log("Updating balances from genesis block.");
        const accountsToUpdate = [
            {
                address: "0x24ee7b148b55df273bc4a9ae95d4fe4a38523d8d",
                balance: 20004,
                hash: "0xe8b3728bde5599de406c5cdf39f89ce02348c3448b6da2a313bd90ed95608d27",
                from: "Genesis",
            },
            {
                address: "0x2b3ef64677cfd74bbc74fab4edecb6ab43a085b6",
                balance: 20004,
                hash: "0x4d262286c104613e4fbe3c699790d5d44217c7e5221c614e3dc0aae509a7da74",
                from: "Genesis",
            },
            {
                address: "0x3a478b61a49b7d7eee100cd5ff87e251b9fb19da",
                balance: 20004,
                hash: "0xb740320293255f0ad625556b59cb609871912807ccd9fa55b744832cb162de20",
                from: "Genesis",
            },
            {
                address: "0x3eaaab80e68df347d4f67dfc2b6e5374dc82cde6",
                balance: 20004,
                hash: "0xcd7ea3a72fa2c5dd0d452c8f3f31e0cc2b600ac5e9845869d39453aa3e46db77",
                from: "Genesis",
            },
            {
                address: "0x41e7a72b843ffa7813ff979dc8bc21429e461ad9",
                balance: 20004,
                hash: "0xbfb3aa77474d9b00a8fbdafda9408ffcb18006e9c7e84daeded689226763b407",
                from: "Genesis",
            },
            {
                address: "0x4a2d36406509336db56818f356c4f631388e7dd4",
                balance: 20004,
                hash: "0xdf2f806ff7015437aac5503d29c2a8f18058cbab5f0eab49286ae5a2bff675a2",
                from: "Genesis",
            },
            {
                address: "0x501ec2563de403a87acfe6631d50d90aabdd1a03",
                balance: 20004,
                hash: "0xaeb093acb09f51636b93c1dd23613bb3e6b6f2801a568792a250e8a4d2ea4f02",
                from: "Genesis",
            },
            {
                address: "0x52161ab9ebeb3468253b4e2a775e730a42f953eb",
                balance: 20004,
                hash: "0xb946fcf20b4fa7f07830cc67842cca310b2471ca62edefcdda34eb30dc0df483",
                from: "Genesis",
            },
            {
                address: "0x71a0662967f6fffee0dcd48212442b964c1a72b3",
                balance: 20004,
                hash: "0x9a3447f8b71f58e7239c820071c6792e61ad586f690fb933416d1a1820c1205b",
                from: "Genesis",
            },
            {
                address: "0x87142ee9ad7c1b675005e39b4fcaac7452df49fc",
                balance: 20004,
                hash: "0x0a19e07c24a09ee7866993b3fb00c9d9a59aaeaa9ed14427c4df382f7f100723",
                from: "Genesis",
            },
            {
                address: "0xbc75c3b64e7621469509df5cdd61f4f419ec903f",
                balance: 80000000,
                hash: "0xf1690ceb18e28b52e019a57702f321b824c976b7bb1a218f7fd0faf2574aa4fd",
                from: "Genesis",
            },
            {
                address: "0xc0ad1d8829e0e3750923711820ab5db8e9028eba",
                balance: 20004,
                hash: "0x994f4f6603efd61200f0a9bf53332f6b694b476b920ecf473be06a6acde812e4",
                from: "Genesis",
            },
            {
                address: "0xf9216c8e2d584194aedba520b471145df460bc90",
                balance: 20004,
                hash: "0x74886f13cb610f8413c0fd160ed92b69a58530f08f93b6ff593ce6810df124bd",
                from: "Genesis",
            },
        ];

        for (const account of accountsToUpdate) {
            await Account.collection.updateOne(
                { address: account.address },
                {
                    $inc: {
                        balance: account.balance,
                    },
                    $set: {
                        address: account.address,
                        // Block 0 is genesis block.
                        blockNumber: 0,
                    },
                },
                { upsert: true, session }
            );
        }

        for (const account of accountsToUpdate) {
            const transactionIndex = accountsToUpdate.indexOf(account);
            const transaction = {
                blockHash: blockData.hash,
                blockNumber: 0,
                from: "Genesis",
                hash: account.hash,
                value: account.balance.toString(),
                nonce: 0,
                timestamp: blockData.timestamp,
                status: true,
                to: account.address,
                transactionIndex,
                gas: 21000,
                gasUsed: 0,
                gasPrice: "0",
                input: "0x"
            };

            await Transaction.collection.insertOne(transaction, {
                session,
            });
        }
        console.log("Finished updating balances from genesis block.");
        await session.endSession();
    } catch (error) {
        await session.endSession();
        console.log(
            "Error occurred while updating balances from genesis block",
            error
        );
    }
}

async function calculateTotalTransactions() {
    try {
        const total = await Transaction.collection.countDocuments();

        await MinedBlocksCount.findOneAndUpdate(
            {
                // Filter
                type: "global",
            },
            {
                // Update
                amount: total,
            },
            {
                // Options
                upsert: true,
                new: true,
            }
        );
    } catch (error) {
        console.log("calculateTotalTransactions ERROR", error);
    }
}

async function parseBlockToDb(blockData) {
    try {
        // So we obviously have transaction(s).
        blockData.miner = blockData.miner?.toLowerCase();
        const transactions = [];
        const accountDataPerTransaction = [];
        let contract;
        // let internalTxData;

        if (blockData?.transactions?.length > 0) {
            for (const txData of blockData.transactions) {
                // console.log(`Before Receipt:`);
                // console.log(`txData ahash:`, txData.hash);
                const receipt = await httpWeb3.eth.getTransactionReceipt(
                    txData.hash
                );
                // console.log(`Receipt:`, receipt);
                const tx = await normalizeTX(txData, receipt, blockData);
                const accountData = {};
                // Contact creation tx, Event logs of internal transaction
                if (txData?.input?.length > 2) {
                    if (txData.to === null) {
                        contract = await handleContractDeployment(
                            blockData,
                            txData,
                            receipt
                        );
                    } else {
                        // @TODO: Internal TX handling
                        // internalTxData = await handleInternalTx(
                        //     blockData,
                        //     txData,
                        //     tx
                        // );
                    }
                }

                if (tx.creates) {
                    accountData[tx.creates] = {
                        address: tx.creates,
                        blockNumber: tx.blockNumber,
                        balance: Number(0 + tx.value),
                        type: 1, // contract
                    };
                }

                accountData[tx.from] = {
                    address: tx.from,
                    blockNumber: tx.blockNumber,
                    balance: Number(0 - tx.value),
                };

                if (tx.to) {
                    accountData[tx.to] = {
                        address: tx.to,
                        blockNumber: tx.blockNumber,
                        balance: Number(0 + tx.value),
                    };

                    // If you send to yourself nothing changes.
                    if (tx.to === tx.from) {
                        accountData[tx.to].balance = accountData[
                            tx.from
                        ].balance = 0;
                    }
                }

                accountDataPerTransaction.push(accountData);
                transactions.push(tx);
            }
        }

        // Add miner rewards
        accountDataPerTransaction.push({
            [blockData.miner]: {
                address: blockData.miner,
                blockNumber: blockData.number,
                balance: Number(0 + getBlockReward(blockData.number)),
            },
        });
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (const accountData of accountDataPerTransaction) {
                    const accountKeys = Object.keys(accountData);
                    for (const account of accountKeys) {
                        await Account.collection.updateOne(
                            { address: account },
                            {
                                $inc: {
                                    balance: accountData[account].balance,
                                },
                                $set: {
                                    address: account,
                                    blockNumber:
                                        accountData[account].blockNumber,
                                },
                            },
                            { upsert: true, session }
                        );
                    }
                }
                if (contract) {
                    await Contract.updateOne(
                        { address: contract.address },
                        { $setOnInsert: contract },
                        { upsert: true, session }
                    );
                }

                // @TODO: Internal TX handling
                // if (
                //     internalTxData?.type === "transfer" ||
                //     internalTxData?.type === "transferfrom"
                // ) {
                //     await TokenTransfer.updateOne(
                //         { hash: internalTxData.transfer.hash },
                //         { $setOnInsert: internalTxData.transfer },
                //         { upsert: true, session }
                //     );
                // } else if (internalTxData?.type === "endRound") {
                //     for (const transaction of internalTxData.internalTransactions) {
                //         console.log(`Transaction ${transaction.hash}`);
                //     }
                //     await InternalTransaction.collection.insertMany(
                //         internalTxData.internalTransactions,
                //         {
                //             session,
                //         }
                //     );
                // }
                if (blockData?.transactions?.length > 0) {
                    await Transaction.collection.insertMany(transactions, {
                        session,
                    });
                }
                await Block.collection.insertOne(blockData, {
                    session,
                });
            });
            session.endSession();
        } catch (error) {
            session.endSession();
            console.log("Error occurred in storing in db.", error);
        }
    } catch (error) {
        console.log("parseBlockToDb failed:", error);
    }
}

async function handleInternalTx(blockData, txData, tx) {
    try {
        // Internal transaction  . write to doc of InternalTx
        const transfer = {
            hash: "",
            blockNumber: 0,
            from: "",
            to: "",
            contract: "",
            value: 0,
            timestamp: 0,
        };
        const endOfMethodCode = 10;
        const methodCode = txData.input.substr(0, endOfMethodCode);
        if (
            ERC20_METHOD_DIC[methodCode] === "transfer" ||
            ERC20_METHOD_DIC[methodCode] === "transferFrom" ||
            ERC20_METHOD_DIC[methodCode] === "endRound"
        ) {
            const addressOneStart = 34;
            const addressOneEnd = 74;
            const addressTwoEnd = 114;
            if (ERC20_METHOD_DIC[methodCode] === "transfer") {
                // Token transfer transaction
                transfer.from = txData.from;
                transfer.to = `0x${txData.input.substring(
                    addressOneStart,
                    addressOneEnd
                )}`;
                transfer.value = Number(`0x${txData.input.substring(74)}`);
                transfer.method = ERC20_METHOD_DIC[methodCode];
                transfer.hash = txData.hash;
                transfer.blockNumber = blockData.number;
                transfer.contract = txData.to;
                transfer.timestamp = blockData.timestamp;
                // Write transfer transaction into db
                return {
                    type: ERC20_METHOD_DIC[methodCode],
                    transfer,
                };
            } else if (ERC20_METHOD_DIC[methodCode] === "transferFrom") {
                // transferFrom
                transfer.from = `0x${txData.input.substring(
                    addressOneStart,
                    addressOneEnd
                )}`;
                transfer.to = `0x${txData.input.substring(
                    addressOneEnd,
                    addressTwoEnd
                )}`;
                transfer.value = Number(
                    `0x${txData.input.substring(addressTwoEnd)}`
                );
                transfer.method = ERC20_METHOD_DIC[methodCode];
                transfer.hash = txData.hash;
                transfer.blockNumber = blockData.number;
                transfer.contract = txData.to;
                transfer.timestamp = blockData.timestamp;
                // Write transfer transaction into db
                return {
                    type: ERC20_METHOD_DIC[methodCode],
                    transfer,
                };
            } else if (ERC20_METHOD_DIC[methodCode] === "endRound") {
                // Internal transaction; Quake endRound
                const decodedData = abiDecoder.decodeMethod(txData.input);
                const internalTransactionsAddresses =
                    decodedData.params[0].value;
                const internalTransactionsValues = decodedData.params[1].value;
                const internalTransactions = [];

                for (let i = 0; i < internalTransactionsAddresses.length; i++) {
                    txData.value = etherUnits.toEther(
                        new BigNumber(internalTransactionsValues[i]),
                        "wei"
                    );
                    txData.to = internalTransactionsAddresses[i];
                    txData.from = tx.to;
                    txData.method = ERC20_METHOD_DIC[methodCode];
                    txData.hash = txData.hash;
                    txData.blockNumber = blockData.number;
                    txData.contract = txData.to;
                    txData.timestamp = blockData.timestamp;
                    delete txData._id;
                    // Add to internal transactions
                    console.log("txData", txData);
                    internalTransactions.push(txData);
                }

                return {
                    type: ERC20_METHOD_DIC[methodCode],
                    internalTransactions,
                };
            }
        }
    } catch (error) {
        console.log("handleInternalTx failed:", error);
    }
}

async function handleContractDeployment(blockData, txData, receipt) {
    try {
        // Support Parity & Geth case
        if (txData.creates) {
            contractAddress = txData.creates.toLowerCase();
        } else {
            contractAddress = receipt.contractAddress.toLowerCase();
        }
        const contractdb = {};
        let isTokenContract = true;
        const Token = new web3.eth.Contract(ERC20ABI, contractAddress);
        contractdb.address = contractAddress;
        contractdb.owner = txData.from;
        contractdb.blockNumber = blockData.number;
        contractdb.creationTransaction = txData.hash;
        try {
            const call = await web3.eth.call({
                to: contractAddress,
                data: web3.utils.sha3("totalSupply()"),
            });
            if (call === "0x") {
                isTokenContract = false;
            } else {
                try {
                    // ERC20 & ERC223 Token Standard compatible format
                    contractdb.tokenName = await Token.methods.name().call();
                    contractdb.decimals = await Token.methods.decimals().call();
                    contractdb.symbol = await Token.methods.symbol().call();
                    contractdb.totalSupply = await Token.methods
                        .totalSupply()
                        .call();
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
        return contractdb;
    } catch (error) {
        console.log("handleContractDeployment failed:", error);
    }
}

async function fetchBlockFromChain(block) {
    try {
        if (!block && block !== 0) {
            console.log(
                "Thats weird, you can't call fetchBlockFromChain without a block number, or blockHeader.hash, you pancake."
            );
            runner--;
        } else {
            // console.log(web3.currentProvider);
            web3.eth.getBlock(block, true, async (error, blockData) => {
                if (error) {
                    console.log(
                        `Warning (quickSync): error on getting block with hash/number: ${block}: ${error}`
                    );
                } else if (blockData === null) {
                    console.log(
                        `Warning: null block data received from the block with hash/number: ${block}`
                    );
                } else {
                    try {
                        await parseBlockToDb(blockData);
                    } catch (error) {
                        console.error("DB Block & TX Session error", error);
                    }

                    if (blockData.number === config.startBlock) {
                        await updateBalancesFromGenesisBlock(blockData);
                    }
                }
                runner--;
            });
        }
    } catch (error) {
        console.log("fetchBlockFromChain error - ", error);
        runner--;
    }
}

/**
  Fetch market price from cryptocompare
**/
// 10 minutes
const quoteInterval = 10 * 60 * 1000;

const getQuote = async () => {
    const URL = `https://min-api.cryptocompare.com/data/price?fsym=${config.settings.symbol}&tsyms=USD`;

    try {
        const requestUSD = await fetch(URL);
        const quoteUSD = await requestUSD.json();

        quoteObject = {
            timestamp: Math.round(Date.now() / 1000),
            quoteUSD: quoteUSD.USD,
        };

        new Market(quoteObject).save((err, market, count) => {
            if (typeof err !== "undefined" && err) {
                process.exit(9);
            } else {
                if (!("quiet" in config && config.quiet === true)) {
                    console.log("DB successfully written for market quote.");
                }
            }
        });
    } catch (error) {
        if (!("quiet" in config && config.quiet === true)) {
            console.log(error);
        }
    }
};

// check NORICHLIST env
// you can use it like as 'NORICHLIST=1 node tools/sync.js' to disable balance updater temporary.
if (process.env.NORICHLIST) {
    config.settings.useRichList = false;
}

// Starts full sync when set to true in config
if (config.syncAll === true) {
    console.log("Starting Full Sync in 5 seconds");
    setTimeout(async () => {
        console.log("Starting Full Sync");

        await retryMissingBlocks();
        await quickSync(config);
    }, 7500);
}

async function updateMinerMinedBlocks() {
    const miners = await Block.collection.distinct("miner");
    console.log("miners", miners);
    for (const miner of miners) {
        const result = await Block.collection.countDocuments({ miner });
        if (miner != "0x0000000000000000000000000000000000000000") {
            console.log(`Miner ${miner} : ${result}`);
            await MinedBlocksCount.findOneAndUpdate(
                {
                    // Filter
                    address: miner,
                },
                {
                    // Update
                    amount: result,
                    type: "address",
                },
                {
                    // Options
                    upsert: true,
                }
            );
        }
    }
}

async function retryMissingBlocks(start, missingBlocks) {
    try {
        if (!missingBlocks) {
            start = 0;
            const count = await Block.collection.countDocuments();
            if (!count) {
                return console.log(
                    "No blocks in DB, skipping retryMissingBlocks."
                );
            }

            missingBlocks = await calculateMissingBlocks(count);
        }

        if (missingBlocks.length === start) {
            console.log("No missing blocks found, perfect.");
        } else {
            // console.log("Missing blocks found, retrieving them, Standby.");
            // console.log(`Start ${config.bulkSize - runner} tasks`);

            let nextStart = 0;
            for (
                let i = start;
                i <= missingBlocks.length && runner < config.bulkSize;
                i++
            ) {
                if (missingBlocks[i]) {
                    runner++;
                    await fetchBlockFromChain(missingBlocks[i]);
                }

                nextStart = i;
            }

            setTimeout(async () => {
                // console.log(
                //     `Recovered ${config.bulkSize} blocks, checking if theres more to recover`
                // );
                await retryMissingBlocks(nextStart, missingBlocks);
            }, 2000);
        }
    } catch (error) {
        console.log("retryMissingBlocks Error", error);
    }
}

async function calculateMissingBlocks(total) {
    try {
        const highest = (
            await Block.collection.findOne({}, { sort: { number: -1 } })
        ).number;
        const lowest = (
            await Block.collection.findOne({}, { sort: { number: 1 } })
        ).number;
        const blocksTotal = highest + 1 - lowest;
        console.log(
            `Expected blocks = ${highest} - ${lowest} = ${blocksTotal}`
        );
        console.log(
            `Missing blocks = ${blocksTotal} - ${total} = ${
                blocksTotal - total
            }`
        );

        const aggregationResult = await Block.collection
            .aggregate([
                {
                    $match: {
                        number: { $gte: lowest, $lte: highest },
                    },
                },

                {
                    $group: {
                        _id: null,
                        numbers: { $push: "$number" },
                    },
                },

                {
                    $addFields: {
                        allNumbers: { $range: [lowest, highest] },
                    },
                },

                {
                    $project: {
                        _id: 0,
                        missing: {
                            $setDifference: ["$allNumbers", "$numbers"],
                        },
                    },
                },
            ])
            .toArray();
        return aggregationResult[0].missing;
    } catch (error) {
        console.error("CalculatingmissingBlocks Error - ", error);
    }
}

// Start price sync on DB
if (config.settings.useFiat) {
    getQuote();

    setInterval(() => {
        getQuote();
    }, quoteInterval);
}

// Didux Quake contract ABI
const abi = [
    {
        constant: true,
        inputs: [],
        name: "getGameDetails",
        outputs: [
            {
                name: "",
                type: "string",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "int256",
            },
            {
                name: "",
                type: "string",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "contractName",
                type: "string",
            },
            {
                name: "deposit",
                type: "int256",
            },
            {
                name: "minimalParticipants",
                type: "int256",
            },
            {
                name: "firstReward",
                type: "int256",
            },
            {
                name: "secondReward",
                type: "int256",
            },
            {
                name: "thirdReward",
                type: "int256",
            },
            {
                name: "serverReward",
                type: "int256",
            },
            {
                name: "rewardType",
                type: "string",
            },
        ],
        name: "setGameDetails",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "winnersAddresses",
                type: "address[]",
            },
            {
                name: "winnersAmounts",
                type: "uint256[]",
            },
        ],
        name: "endRound",
        outputs: [],
        payable: true,
        stateMutability: "payable",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            {
                name: "participantAddress",
                type: "address",
            },
        ],
        name: "isValidParticipant",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "participantAddress",
                type: "address",
            },
        ],
        name: "addParticipant",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "amountOfParticipants",
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            {
                name: "owner",
                type: "address",
            },
            {
                name: "contractName",
                type: "string",
            },
            {
                name: "deposit",
                type: "int256",
            },
            {
                name: "minimalParticipants",
                type: "int256",
            },
            {
                name: "firstReward",
                type: "int256",
            },
            {
                name: "secondReward",
                type: "int256",
            },
            {
                name: "thirdReward",
                type: "int256",
            },
            {
                name: "serverReward",
                type: "int256",
            },
            {
                name: "rewardType",
                type: "string",
            },
        ],
        payable: true,
        stateMutability: "payable",
        type: "constructor",
    },
    {
        payable: true,
        stateMutability: "payable",
        type: "fallback",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: false,
                name: "winnersAddresses",
                type: "address[]",
            },
            {
                indexed: false,
                name: "winnersAmounts",
                type: "uint256[]",
            },
        ],
        name: "WinnersSummary",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: false,
                name: "amount",
                type: "uint256",
            },
        ],
        name: "ContractReceivedFunds",
        type: "event",
    },
];
abiDecoder.addABI(abi);
