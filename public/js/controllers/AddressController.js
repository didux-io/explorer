

angular.module('BlocksApp').controller('AddressController', function($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function() {   
        // initialize core components
        App.initAjax();
    });

    let minedBlocksTableExists = false;
    let transactionBlocksTableExists = false;

    $scope.changeActiveTab = function (tabId) {
      $scope.activeTab = 'tab_addr_'+ tabId;

      if (tabId === 4) {
        fetchMinedBlocks($scope.addr.minedBlockCount);
      }
      event.preventDefault();
    }

    const web3 = new Web3();

    var activeTab = $location.url().split('#');
    if (activeTab.length > 1) {
      $scope.activeTab = activeTab[1]; 
    } else {
      $scope.activeTab = 'tab_addr_1';
    }

    $rootScope.$state.current.data["pageSubTitle"] = web3.toChecksumAddress($stateParams.hash);
    $scope.addrHash = $stateParams.hash;
    $scope.addr = {"balance": 0, "count": 0, "mined": 0};
    $scope.settings = $rootScope.setup;

    var fetchMinedBlocks = function(count) {
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
          { "render": function(data, type, row) {
                        return '<a href="/block/'+data+'">'+data+'</a>' // Block Number
                      }, "targets": [0]},
          { "render": function(data, type, row) {
                        return data; // Block Reward
                      }, "targets": [1]},
          { "render": function(data, type, row) {
                        return data; // Gas Used
                      }, "targets": [2]},
          { "render": function(data, type, row) {
                        return data; // Gas Limit
                      }, "targets": [3]},
          { "render": function(data, type, row) {
                        return timeConverter(data); // Timestamp
                      }, "targets": [4]},
          ]
      });
    }

    var timeConverter = function(UNIX_timestamp){
      var a = new Date(UNIX_timestamp * 1000);
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var year = a.getFullYear();
      var month = months[a.getMonth()];
      var date = a.getDate();
      var hour = a.getHours();
      var min = a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes(); 
      var sec = a.getSeconds() < 10 ? '0' + a.getSeconds() : a.getSeconds();
      var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
      return time;
    }

    //fetch transactions
    var fetchTxs = function() {
      var table = $("#table_txs").DataTable({
        processing: true,
        serverSide: true,
        searching: false,
        paging: true,
        ajax: function(data, callback, settings) {
          data.addr = $scope.addrHash;
          data.count = $scope.addr.count;
          $http.post('/addr', data).then(function(resp) {
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

          $http.post('/addr_count', data).then(function(resp) {
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
          { "targets": [ 5 ], "visible": false, "searchable": false },
          {"type": "date", "targets": 6},
          {"orderable": false, "targets": [0,2,3,4]},
          { "render": function(data, type, row) {
                        let checkSumCheckedAddress = data;
                        if (data !== null) {
                          checkSumCheckedAddress = web3.toChecksumAddress(data);
                        }
                        return '<a href="/addr/'+data+'">'+checkSumCheckedAddress+'</a>'
                      }, "targets": [2,3]},
          { "render": function(data, type, row) {
                        return '<a href="/block/'+data+'">'+data+'</a>'
                      }, "targets": [1]},
          { "render": function(data, type, row) {
                        return '<a href="/tx/'+data+'">'+web3.toChecksumAddress(data)+'</a>'
                      }, "targets": [0]},
          { "render": function(data, type, row) {
                        return getDuration(data).toString();
                      }, "targets": [6]},
          { "render": function(data, type, row) {
                    return data+' XSM'.toString();
                }, "targets": [4]},
          ]
      });
    }

    var fetchInternalTxs = function() {
      var table = $("#table_internal_txs").DataTable({
        processing: true,
        serverSide: true,
        searching: false,
        paging: true,
        ajax: function(data, callback, settings) {
          data.addr = $scope.addrHash;
          data.count = $scope.addr.count;
          $http.post('/internal_addr', data).then(function(resp) {
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

          $http.post('/internal_addr_count', data).then(function(resp) {
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
          { "targets": [ 5 ], "visible": false, "searchable": false },
          {"type": "date", "targets": 6},
          {"orderable": false, "targets": [0,2,3,4]},
          { "render": function(data, type, row) {
                        let checkSumCheckedAddress = data;
                        if (data !== null) {
                          checkSumCheckedAddress = web3.toChecksumAddress(data);
                        }
                        return '<a href="/addr/'+data+'">'+checkSumCheckedAddress+'</a>'
                      }, "targets": [2,3]},
          { "render": function(data, type, row) {
                        return '<a href="/block/'+data+'">'+data+'</a>'
                      }, "targets": [1]},
          { "render": function(data, type, row) {
                        return '<a href="/tx/'+data+'">'+web3.toChecksumAddress(data)+'</a>'
                      }, "targets": [0]},
          { "render": function(data, type, row) {
                        return getDuration(data).toString();
                      }, "targets": [6]},
          { "render": function(data, type, row) {
                    return data+' XSM'.toString();
                }, "targets": [4]},
          ]
      });
    }

    $http({
      method: 'POST',
      url: '/web3relay',
      data: {"addr": $scope.addrHash, "options": ["balance", "count", "bytecode"]}
    }).then(function(resp) {
      $scope.addr = $.extend($scope.addr, resp.data);
      fetchTxs();
      if (resp.data.isContract) {
        $rootScope.$state.current.data["pageTitle"] = "Contract Address";
        $http({
          method: 'GET',
          url: '/contractdetails?addr=' + $scope.addrHash,
        }).then(function(data) {
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
      }).then(function(data) {
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
      data: {"addr": $scope.addrHash}
    }).then(function(resp) {
      $scope.addr.ethfiat = resp.data.balance;
    });
})
.directive('contractSource', function($http) {
  return {
    restrict: 'E',
    templateUrl: '/views/contract-source.html',
    scope: false,
    link: function(scope, elem, attrs){
        //fetch contract stuff
        $http({
          method: 'POST',
          url: '/compile',
          data: {"addr": scope.addrHash, "action": "find"}
        }).then(function(resp) {
          scope.contract = resp.data;
        });
      }
  }
})
