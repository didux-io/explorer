

angular.module('BlocksApp').controller('AddressController', function ($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function () {
        // initialize core components
        App.initAjax();
    });

    let minedBlocksTableExists = false;

    $scope.changeActiveTab = function (tabId) {
        $scope.activeTab = 'tab_addr_' + tabId;

        if (tabId === 4) {
            fetchMinedBlocks($scope.addr.minedBlockCount);
        }
        event.preventDefault();
    }

    const web3 = new Web3('https://api.didux.network/');

    var activeTab = $location.url().split('#');
    if (activeTab.length > 1) {
        $scope.activeTab = activeTab[1];
    } else {
        $scope.activeTab = 'tab_addr_1';
    }

    var getClaims = async function (claimType, contractAddress) {
        console.log('getClaims');
        console.log('claimType:', claimType);
        console.log('contractAddress:', contractAddress);
        let claims = [];
        try {
            const contract = new web3.eth.Contract(didContractAbi, contractAddress);
            claims = await contract.methods.getClaimIdsByType(claimType).call();
        } catch (error) {
            // Don't log an error, it's fine. The table will show the empty claims text
            console.log('No claims for addr:', contractAddress);
        }
        console.log('getClaims result:', claims);
        // if (result.length > 0) {
        //     const claimsArray = [];
        //     const claim = await contract.methods.getClaim(result[0]).call();
        //     console.log('claim:', claim);
        //     claimsArray.push(claim);
        //     $scope.claimsData = result;
        // } else {
        //     $scope.claimsData = [];
        // }
        return claims;
    }

    $rootScope.$state.current.data["pageSubTitle"] = web3.utils.toChecksumAddress($stateParams.hash);
    $scope.addrHash = $stateParams.hash;
    $scope.addr = { "balance": 0, "count": 0, "mined": 0 };
    $scope.settings = $rootScope.setup;

    var setupClaims = async () => {
        let claimsArray = [];
        var claims1000 = await getClaims(1000, $scope.addrHash);
        console.log('claims 1000:', claims1000);
        for (let claim of claims1000) {
            claimsArray.push([claim, 1000]);
        }
        var claims999 = await getClaims(999, $scope.addrHash);
        console.log('claims 999:', claims999);
        for (let claim of claims999) {
            claimsArray.push([claim, 999]);
        }
        $("#table_claims").DataTable({
            processing: false,
            serverSide: false,
            ordering: false,
            searching: true,
            paging: true,
            data: claimsArray,
            "lengthMenu": [
                [10, 20, 50, 100, 150],
                [10, 20, 50, 100, 150] // change per page values here
            ],
            "pageLength": 20,
            "language": {
                "lengthMenu": "_MENU_ Show Claims Per Page",
                "zeroRecords": "No claims found",
                "infoEmpty": "",
                "infoFiltered": "(filtered from _MAX_ total ctxs)"
            },
            "columnDefs": [
                {
                    "render": function (data, type, claim) {
                        return '<a href="/claim/' + claim[0] + '/' + $scope.addrHash + '">' + claim[0] + '</a>' // Claim Id
                    }, "targets": [0],
                
                },
            ]
        });
    }

    setupClaims();

    var fetchMinedBlocks = function (count) {
        if (minedBlocksTableExists) {
            return;
        }
        minedBlocksTableExists = true;
        $("#table_mined_blocks").DataTable({
            processing: true,
            serverSide: true,
            ordering: false,
            searching: false,
            paging: true,
            ajax: {
                url: '/minedblocks',
                type: 'POST',
                data: { "addr": $scope.addrHash, count: count }
            },
            "lengthMenu": [
                [10, 20, 50, 100, 150],
                [10, 20, 50, 100, 150] // change per page values here
            ],
            "pageLength": 20,
            "language": {
                "lengthMenu": "_MENU_ Show Mined Blocks Per Page",
                "zeroRecords": "No mined blocks found",
                "infoEmpty": "",
                "infoFiltered": "(filtered from _MAX_ total mtxs)"
            },
            "columnDefs": [
                {
                    "render": function (data, type, row) {
                        return '<a href="/block/' + data + '">' + data + '</a>' // Block Number
                    }, "targets": [0]
                },
                {
                    "render": function (data, type, row) {
                        return data; // Block Reward
                    }, "targets": [1]
                },
                {
                    "render": function (data, type, row) {
                        return data; // Gas Used
                    }, "targets": [2]
                },
                {
                    "render": function (data, type, row) {
                        return data; // Gas Limit
                    }, "targets": [3]
                },
                {
                    "render": function (data, type, row) {
                        return timeConverter(data); // Timestamp
                    }, "targets": [4]
                },
            ]
        });
    }

    var timeConverter = function (UNIX_timestamp) {
        var a = new Date(UNIX_timestamp * 1000);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var year = a.getFullYear();
        var month = months[a.getMonth()];
        var date = a.getDate();
        var hour = a.getHours();
        var min = a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes();
        var sec = a.getSeconds() < 10 ? '0' + a.getSeconds() : a.getSeconds();
        var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
        return time;
    }

    //fetch transactions
    var fetchTxs = function () {
        var table = $("#table_txs").DataTable({
            processing: true,
            serverSide: true,
            searching: false,
            paging: true,
            ajax: function (data, callback, settings) {
                data.addr = $scope.addrHash;
                data.count = $scope.addr.count;
                $http.post('/addr', data).then(function (resp) {
                    // save data
                    $scope.internalTxData = resp.data;
                    // check $scope.records* if available.
                    resp.data.recordsTotal = $scope.recordsTotal ? $scope.recordsTotal : resp.data.recordsTotal;
                    resp.data.recordsFiltered = $scope.recordsFiltered ? $scope.recordsFiltered : resp.data.recordsFiltered;
                    callback(resp.data);
                });

                // get mined, recordsTotal counter only once.
                if (data.draw > 1)
                    return;

                $http.post('/addr_count', data).then(function (resp) {
                    $scope.addr.count = resp.data.recordsTotal;
                    $scope.addr.mined = parseInt(resp.data.mined);

                    data.count = resp.data.recordsTotal;

                    // set $scope.records*
                    $scope.recordsTotal = resp.data.recordsTotal;
                    $scope.recordsFiltered = resp.data.recordsFiltered;
                    // draw table if $scope.internalTxData available.
                    if ($scope.internalTxData) {
                        $scope.internalTxData.recordsTotal = resp.data.recordsTotal;
                        $scope.internalTxData.recordsFiltered = resp.data.recordsFiltered;
                        callback($scope.internalTxData);
                    }
                });
            },
            "lengthMenu": [
                [10, 20, 50, 100, 150, 500],
                [10, 20, 50, 100, 150, 500] // change per page values here
            ],
            "pageLength": 20,
            "order": [
                [6, "desc"]
            ],
            "language": {
                "lengthMenu": "_MENU_ Show Transactions Per Page",
                "zeroRecords": "No transactions found",
                "infoEmpty": "",
                "infoFiltered": "(filtered from _MAX_ total txs)"
            },
            "columnDefs": [
                { "targets": [5], "visible": false, "searchable": false },
                { "type": "date", "targets": 6 },
                { "orderable": false, "targets": [0, 2, 3, 4] },
                {
                    "render": function (data, type, row) {
                        let checkSumCheckedAddress = data;
                        if (data !== null) {
                            checkSumCheckedAddress = web3.utils.toChecksumAddress(data);
                        }
                        return '<a href="/addr/' + data + '">' + checkSumCheckedAddress + '</a>'
                    }, "targets": [2, 3]
                },
                {
                    "render": function (data, type, row) {
                        return '<a href="/block/' + data + '">' + data + '</a>'
                    }, "targets": [1]
                },
                {
                    "render": function (data, type, row) {
                        return '<a href="/tx/' + data + '">' + data + '</a>'
                    }, "targets": [0]
                },
                {
                    "render": function (data, type, row) {
                        return getDuration(data).toString();
                    }, "targets": [6]
                },
                {
                    "render": function (data, type, row) {
                        return data + ' XSM'.toString();
                    }, "targets": [4]
                },
            ]
        });
    }

    var fetchInternalTxs = function () {
        var table = $("#table_internal_txs").DataTable({
            processing: true,
            serverSide: true,
            searching: false,
            paging: true,
            ajax: function (data, callback, settings) {
                data.addr = $scope.addrHash;
                data.count = $scope.addr.count;
                $http.post('/internal_addr', data).then(function (resp) {
                    // save data
                    $scope.normalTxData = resp.data;
                    // check $scope.records* if available.
                    resp.data.recordsTotal = $scope.recordsTotal ? $scope.recordsTotal : resp.data.recordsTotal;
                    resp.data.recordsFiltered = $scope.recordsFiltered ? $scope.recordsFiltered : resp.data.recordsFiltered;
                    callback(resp.data);
                });

                // get mined, recordsTotal counter only once.
                if (data.draw > 1)
                    return;

                $http.post('/internal_addr_count', data).then(function (resp) {
                    $scope.addr.internalCount = resp.data.recordsTotal;

                    data.count = resp.data.recordsTotal;

                    // set $scope.records*
                    $scope.recordsTotal = resp.data.recordsTotal;
                    $scope.recordsFiltered = resp.data.recordsFiltered;
                    // draw table if $scope.normalTxData available.
                    if ($scope.normalTxData) {
                        $scope.normalTxData.recordsTotal = resp.data.recordsTotal;
                        $scope.normalTxData.recordsFiltered = resp.data.recordsFiltered;
                        callback($scope.normalTxData);
                    }
                });
            },
            "lengthMenu": [
                [10, 20, 50, 100, 150, 500],
                [10, 20, 50, 100, 150, 500] // change per page values here
            ],
            "pageLength": 20,
            "order": [
                [6, "desc"]
            ],
            "language": {
                "lengthMenu": "_MENU_ Show Internal Transactions Per Page",
                "zeroRecords": "No internal transactions found",
                "infoEmpty": "",
                "infoFiltered": "(filtered from _MAX_ total itxs)"
            },
            "columnDefs": [
                { "targets": [5], "visible": false, "searchable": false },
                { "type": "date", "targets": 6 },
                { "orderable": false, "targets": [0, 2, 3, 4] },
                {
                    "render": function (data, type, row) {
                        let checkSumCheckedAddress = data;
                        if (data !== null) {
                            checkSumCheckedAddress = web3.utils.toChecksumAddress(data);
                        }
                        return '<a href="/addr/' + data + '">' + checkSumCheckedAddress + '</a>'
                    }, "targets": [2, 3]
                },
                {
                    "render": function (data, type, row) {
                        return '<a href="/block/' + data + '">' + data + '</a>'
                    }, "targets": [1]
                },
                {
                    "render": function (data, type, row) {
                        return '<a href="/tx/' + data + '">' + data + '</a>'
                    }, "targets": [0]
                },
                {
                    "render": function (data, type, row) {
                        return getDuration(data).toString();
                    }, "targets": [6]
                },
                {
                    "render": function (data, type, row) {
                        return data + ' XSM'.toString();
                    }, "targets": [4]
                },
            ]
        });
    }

    $http({
        method: 'POST',
        url: '/web3relay',
        data: { "addr": $scope.addrHash, "options": ["balance", "count", "bytecode"] }
    }).then(function (resp) {
        $scope.addr = $.extend($scope.addr, resp.data);
        fetchTxs();
        if (resp.data.isContract) {
            $rootScope.$state.current.data["pageTitle"] = "Contract Address";
            $http({
                method: 'GET',
                url: '/contractdetails?addr=' + $scope.addrHash,
            }).then(function (data) {
                $scope.addr.owner = data.data.owner;
                $scope.addr.creationTransaction = data.data.creationTransaction;
            });
        } else {
            $rootScope.$state.current.data["pageTitle"] = "Address";
        }
        fetchInternalTxs();
        $http({
            method: 'GET',
            url: '/minedblockcount?addr=' + $scope.addrHash,
        }).then(function (data) {
            $scope.addr.minedBlockCount = data.data;
            if ($scope.activeTab === "tab_addr_4") {
                fetchMinedBlocks($scope.addr.minedBlockCount);
            }
        });
    });

    // fetch ethf balance 
    if ($scope.settings.useEthFiat)
        $http({
            method: 'POST',
            url: '/fiat',
            data: { "addr": $scope.addrHash }
        }).then(function (resp) {
            $scope.addr.ethfiat = resp.data.balance;
        });
})
    .directive('contractSource', function ($http) {
        return {
            restrict: 'E',
            templateUrl: '/views/contract-source.html',
            scope: false,
            link: function (scope, elem, attrs) {
                //fetch contract stuff
                $http({
                    method: 'POST',
                    url: '/compile',
                    data: { "addr": scope.addrHash, "action": "find" }
                }).then(function (resp) {
                    scope.contract = resp.data;
                });
            }
        }
    })

    var didContractAbi = [
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_key",
                    "type": "bytes32"
                }
            ],
            "name": "getKeyPurpose",
            "outputs": [
                {
                    "name": "purpose",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_key",
                    "type": "bytes32"
                }
            ],
            "name": "getKey",
            "outputs": [
                {
                    "name": "purpose",
                    "type": "uint256"
                },
                {
                    "name": "keyType",
                    "type": "uint256"
                },
                {
                    "name": "key",
                    "type": "bytes32"
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
                    "name": "_key",
                    "type": "bytes32"
                },
                {
                    "name": "_purpose",
                    "type": "uint256"
                },
                {
                    "name": "_type",
                    "type": "uint256"
                }
            ],
            "name": "addKey",
            "outputs": [
                {
                    "name": "success",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_claimType",
                    "type": "uint256"
                }
            ],
            "name": "getClaimIdsByType",
            "outputs": [
                {
                    "name": "claimIds",
                    "type": "bytes32[]"
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
                    "name": "_claimId",
                    "type": "bytes32"
                }
            ],
            "name": "removeClaim",
            "outputs": [
                {
                    "name": "success",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_id",
                    "type": "uint256"
                },
                {
                    "name": "_approve",
                    "type": "bool"
                }
            ],
            "name": "approve",
            "outputs": [
                {
                    "name": "success",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_key",
                    "type": "bytes32"
                }
            ],
            "name": "removeKey",
            "outputs": [
                {
                    "name": "success",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_purpose",
                    "type": "uint256"
                }
            ],
            "name": "getKeysByPurpose",
            "outputs": [
                {
                    "name": "_keys",
                    "type": "bytes32[]"
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
                    "name": "_claimType",
                    "type": "uint256"
                },
                {
                    "name": "_scheme",
                    "type": "uint256"
                },
                {
                    "name": "_issuer",
                    "type": "address"
                },
                {
                    "name": "_signature",
                    "type": "bytes"
                },
                {
                    "name": "_data",
                    "type": "bytes"
                },
                {
                    "name": "_uri",
                    "type": "string"
                }
            ],
            "name": "addClaim",
            "outputs": [
                {
                    "name": "claimRequestId",
                    "type": "bytes32"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_to",
                    "type": "address"
                },
                {
                    "name": "_value",
                    "type": "uint256"
                },
                {
                    "name": "_data",
                    "type": "bytes"
                }
            ],
            "name": "execute",
            "outputs": [
                {
                    "name": "executionId",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_claimId",
                    "type": "bytes32"
                }
            ],
            "name": "getClaim",
            "outputs": [
                {
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "name": "scheme",
                    "type": "uint256"
                },
                {
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "name": "data",
                    "type": "bytes"
                },
                {
                    "name": "uri",
                    "type": "string"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_key",
                    "type": "bytes32"
                },
                {
                    "name": "_purpose",
                    "type": "uint256"
                }
            ],
            "name": "keyHasPurpose",
            "outputs": [
                {
                    "name": "result",
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
                    "name": "_claimType",
                    "type": "uint256"
                },
                {
                    "name": "_scheme",
                    "type": "uint256"
                },
                {
                    "name": "_issuer",
                    "type": "address"
                },
                {
                    "name": "_signature",
                    "type": "bytes"
                },
                {
                    "name": "_data",
                    "type": "bytes"
                },
                {
                    "name": "_uri",
                    "type": "string"
                },
                {
                    "name": "_claimId",
                    "type": "bytes"
                }
            ],
            "name": "addClaimWithClaimId",
            "outputs": [
                {
                    "name": "claimRequestId",
                    "type": "bytes32"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "claimRequestId",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "scheme",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "uri",
                    "type": "string"
                }
            ],
            "name": "ClaimRequested",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "claimId",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "signatureType",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "signature",
                    "type": "bytes32"
                },
                {
                    "indexed": false,
                    "name": "claim",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "uri",
                    "type": "string"
                }
            ],
            "name": "ClaimAdded",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "claimId",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "scheme",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "uri",
                    "type": "string"
                }
            ],
            "name": "ClaimAdded",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "claimId",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "scheme",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "uri",
                    "type": "string"
                }
            ],
            "name": "ClaimRemoved",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "claimId",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "claimType",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "scheme",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "issuer",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                },
                {
                    "indexed": false,
                    "name": "uri",
                    "type": "string"
                }
            ],
            "name": "ClaimChanged",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "executionId",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "name": "value",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                }
            ],
            "name": "ExecutionFailed",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "key",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "purpose",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "keyType",
                    "type": "uint256"
                }
            ],
            "name": "KeyAdded",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "key",
                    "type": "bytes32"
                },
                {
                    "indexed": true,
                    "name": "purpose",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "keyType",
                    "type": "uint256"
                }
            ],
            "name": "KeyRemoved",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "executionId",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "name": "value",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                }
            ],
            "name": "ExecutionRequested",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "executionId",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "name": "value",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "data",
                    "type": "bytes"
                }
            ],
            "name": "Executed",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "executionId",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "approved",
                    "type": "bool"
                }
            ],
            "name": "Approved",
            "type": "event"
        }
    ]
