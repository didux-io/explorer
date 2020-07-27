

angular.module('BlocksApp').controller('ClaimController', function ($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function () {
        // initialize core components
        App.initAjax();
    });

    const web3 = new Web3('https://api.didux.network/');

    const METHOD_DIC = { '0xb1a34e0d': 'addClaim' };

    $scope.claimId = $stateParams.claimId;
    $scope.didContractAddress = $stateParams.didContractAddress;
    $rootScope.$state.current.data["pageSubTitle"] = $scope.claimId;

    var getClaimData = async () => {
        // try {
            const contract = new web3.eth.Contract(didContractAbi, $scope.didContractAddress);
            const claim = await contract.methods.getClaim($scope.claimId).call();
            console.log('claim:', claim);
            $scope.claim = claim;
            $scope.dataParsed = JSON.parse(web3.utils.toAscii(claim.data));
            console.log($scope.dataParsed)
            // Some old contracts dont have a blocknumber
            if (claim.blockNumber) {
                const blockNumber = claim.blockNumber;
                const blockData = await web3.eth.getBlock(blockNumber);
                const blockTransactions = blockData.transactions;
                console.log('blockTransactions:', blockTransactions);
                // Get the block transactions
                for (const txHash of blockTransactions) {
                    const web3 = new Web3('https://api.didux.network/');
                    const tx = await web3.eth.getTransaction(txHash);
                    console.log('tx:', tx);
                    // Check if the transaction was made to this contract
                    if (tx.to.toLowerCase() == $scope.didContractAddress.toLowerCase()) {
                        const txInput = tx.input;
                        const methodCode = txInput.substr(0, 10);
                        // Check if the method was to add a claim
                        if (METHOD_DIC[methodCode] === 'addClaim') {
                            addABI(didContractAbi)
                            const data = decodeMethod(txInput);
                            const dataHex = data.params[4].value;
                            const dataValueString = web3.utils.toAscii(dataHex);
                            // If the transaction data is the same
                            if (dataValueString == JSON.stringify($scope.dataParsed)) {
                                // Set the timestamp and transaction hash
                                $scope.timestamp = new Date(blockData.timestamp * 1000);
                                $scope.tx = tx;
                                new QRCode(document.getElementById("claim-qrcode"), {
                                    text: "https://explorer.didux.network/tx/" + tx.hash,
                                    width: 128,
                                    height: 128,
                                    colorDark : "#000000",
                                    colorLight : "#ffffff",
                                    correctLevel : QRCode.CorrectLevel.H
                                });
                                break;
                            }
                        }
                    } else {
                        console.log('Tx input not the same')
                    }
                }
            }
            $scope.$applyAsync()
        // } catch (error) {
        //     // Don't log an error, it's fine. The table will show the empty claims text
        //     console.log('No claims for addr:', $scope.didContractAddress);
        // }
    }

    getClaimData()
})

const state = {
    savedABIs: [],
    methodIDs: {},
};

function addABI(abiArray) {
    const web3 = new Web3();
    if (Array.isArray(abiArray)) {
        // Iterate new abi to generate method id"s
        abiArray.map(function (abi) {
            if (abi.name) {
                const signature = web3.utils.sha3(
                    abi.name +
                    "(" +
                    abi.inputs
                        .map(function (input) {
                            return input.type;
                        })
                        .join(",") +
                    ")"
                );
                if (abi.type === "event") {
                    state.methodIDs[signature.slice(2)] = abi;
                } else {
                    state.methodIDs[signature.slice(2, 10)] = abi;
                }
            }
        });

        state.savedABIs = state.savedABIs.concat(abiArray);
    } else {
        throw new Error("Expected ABI array, got " + typeof abiArray);
    }
}

function decodeMethod(data) {
    const web3 = new Web3();
    const methodID = data.slice(2, 10);
    const abiItem = state.methodIDs[methodID];
    if (abiItem) {
        const params = abiItem.inputs.map(function (item) {
            return item.type;
        });
        let decoded = web3.eth.abi.decodeParameters(params, data.slice(10));

        let retData = {
            name: abiItem.name,
            params: [],
        };

        for (let i = 0; i < decoded.__length__; i++) {
            let param = decoded[i];
            let parsedParam = param;
            const isUint = abiItem.inputs[i].type.indexOf("uint") === 0;
            const isInt = abiItem.inputs[i].type.indexOf("int") === 0;
            const isAddress = abiItem.inputs[i].type.indexOf("address") === 0;

            if (isUint || isInt) {
                const isArray = Array.isArray(param);

                if (isArray) {
                    parsedParam = param.map(val => new web3.utils.BN(val).toString());
                } else {
                    parsedParam = new web3.utils.BN(param).toString();
                }
            }

            // Addresses returned by web3 are randomly cased so we need to standardize and lowercase all
            if (isAddress) {
                const isArray = Array.isArray(param);

                if (isArray) {
                    parsedParam = param.map(_ => _.toLowerCase());
                } else {
                    parsedParam = param.toLowerCase();
                }
            }

            retData.params.push({
                name: abiItem.inputs[i].name,
                value: parsedParam,
                type: abiItem.inputs[i].type,
            });
        }

        return retData;
    }
}

var didContractAbi = [
    {
        constant: true,
        inputs: [
            {
                name: '_key',
                type: 'bytes32'
            }
        ],
        name: 'getKeyPurpose',
        outputs: [
            {
                name: 'purpose',
                type: 'uint256'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            {
                name: '_key',
                type: 'bytes32'
            }
        ],
        name: 'getKey',
        outputs: [
            {
                name: 'purpose',
                type: 'uint256'
            },
            {
                name: 'keyType',
                type: 'uint256'
            },
            {
                name: 'key',
                type: 'bytes32'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_key',
                type: 'bytes32'
            },
            {
                name: '_purpose',
                type: 'uint256'
            },
            {
                name: '_type',
                type: 'uint256'
            }
        ],
        name: 'addKey',
        outputs: [
            {
                name: 'success',
                type: 'bool'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            {
                name: '_claimType',
                type: 'uint256'
            }
        ],
        name: 'getClaimIdsByType',
        outputs: [
            {
                name: 'claimIds',
                type: 'bytes32[]'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_claimId',
                type: 'bytes32'
            }
        ],
        name: 'removeClaim',
        outputs: [
            {
                name: 'success',
                type: 'bool'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_id',
                type: 'uint256'
            },
            {
                name: '_approve',
                type: 'bool'
            }
        ],
        name: 'approve',
        outputs: [
            {
                name: 'success',
                type: 'bool'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_key',
                type: 'bytes32'
            }
        ],
        name: 'removeKey',
        outputs: [
            {
                name: 'success',
                type: 'bool'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            {
                name: '_purpose',
                type: 'uint256'
            }
        ],
        name: 'getKeysByPurpose',
        outputs: [
            {
                name: '_keys',
                type: 'bytes32[]'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_claimType',
                type: 'uint256'
            },
            {
                name: '_scheme',
                type: 'uint256'
            },
            {
                name: '_issuer',
                type: 'address'
            },
            {
                name: '_signature',
                type: 'bytes'
            },
            {
                name: '_data',
                type: 'bytes'
            },
            {
                name: '_uri',
                type: 'string'
            }
        ],
        name: 'addClaim',
        outputs: [
            {
                name: 'claimRequestId',
                type: 'bytes32'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: false,
        inputs: [
            {
                name: '_to',
                type: 'address'
            },
            {
                name: '_value',
                type: 'uint256'
            },
            {
                name: '_data',
                type: 'bytes'
            }
        ],
        name: 'execute',
        outputs: [
            {
                name: 'executionId',
                type: 'uint256'
            }
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            {
                name: '_claimId',
                type: 'bytes32'
            }
        ],
        name: 'getClaim',
        outputs: [
            {
                name: 'claimType',
                type: 'uint256'
            },
            {
                name: 'scheme',
                type: 'uint256'
            },
            {
                name: 'issuer',
                type: 'address'
            },
            {
                name: 'signature',
                type: 'bytes'
            },
            {
                name: 'data',
                type: 'bytes'
            },
            {
                name: 'uri',
                type: 'string'
            },
            {
                name: 'blockNumber',
                type: 'uint256'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        constant: true,
        inputs: [
            {
                name: '_key',
                type: 'bytes32'
            },
            {
                name: '_purpose',
                type: 'uint256'
            }
        ],
        name: 'keyHasPurpose',
        outputs: [
            {
                name: 'result',
                type: 'bool'
            }
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'claimRequestId',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'claimType',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'scheme',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'issuer',
                type: 'address'
            },
            {
                indexed: false,
                name: 'signature',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'uri',
                type: 'string'
            }
        ],
        name: 'ClaimRequested',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'claimId',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'claimType',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'issuer',
                type: 'address'
            },
            {
                indexed: false,
                name: 'signatureType',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'signature',
                type: 'bytes32'
            },
            {
                indexed: false,
                name: 'claim',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'uri',
                type: 'string'
            }
        ],
        name: 'ClaimAdded',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'claimId',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'claimType',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'scheme',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'issuer',
                type: 'address'
            },
            {
                indexed: false,
                name: 'signature',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'uri',
                type: 'string'
            },
            {
                indexed: false,
                name: 'blockNumber',
                type: 'uint256'
            }
        ],
        name: 'ClaimAdded',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'claimId',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'claimType',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'scheme',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'issuer',
                type: 'address'
            },
            {
                indexed: false,
                name: 'signature',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'uri',
                type: 'string'
            }
        ],
        name: 'ClaimRemoved',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'claimId',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'claimType',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'scheme',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'issuer',
                type: 'address'
            },
            {
                indexed: false,
                name: 'signature',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            },
            {
                indexed: false,
                name: 'uri',
                type: 'string'
            }
        ],
        name: 'ClaimChanged',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'executionId',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'to',
                type: 'address'
            },
            {
                indexed: true,
                name: 'value',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            }
        ],
        name: 'ExecutionFailed',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'key',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'purpose',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'keyType',
                type: 'uint256'
            }
        ],
        name: 'KeyAdded',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'key',
                type: 'bytes32'
            },
            {
                indexed: true,
                name: 'purpose',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'keyType',
                type: 'uint256'
            }
        ],
        name: 'KeyRemoved',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'executionId',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'to',
                type: 'address'
            },
            {
                indexed: true,
                name: 'value',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            }
        ],
        name: 'ExecutionRequested',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'executionId',
                type: 'uint256'
            },
            {
                indexed: true,
                name: 'to',
                type: 'address'
            },
            {
                indexed: true,
                name: 'value',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'data',
                type: 'bytes'
            }
        ],
        name: 'Executed',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: 'executionId',
                type: 'uint256'
            },
            {
                indexed: false,
                name: 'approved',
                type: 'bool'
            }
        ],
        name: 'Approved',
        type: 'event'
    }
]
