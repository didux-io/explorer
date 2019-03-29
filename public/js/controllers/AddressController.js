angular.module('BlocksApp').controller('AddressController', function($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function() {   
        // initialize core components
        App.initAjax();
    });

    let minedBlocksTableExists = false;
    let transactionBlocksTableExists = false;
    
    $rootScope.showHeaderPageTitle = true;

    $scope.changeActiveTab = function (tabId) {
      $scope.activeTab = 'tab_addr_'+ tabId;

      if (tabId === 4) {
        fetchMinedBlocks($scope.addr.minedBlockCount);
      }
    }

    var activeTab = $location.url().split('#');
    if (activeTab.length > 1) {
      $scope.activeTab = activeTab[1]; 
    } else {
      $scope.activeTab = 'tab_addr_1';
    }

    $rootScope.$state.current.data["pageSubTitle"] = $stateParams.hash;
    $scope.addrHash = $stateParams.hash;
    $scope.addr = {"balance": 0, "count": 0, "mined": 0};
    $scope.settings = $rootScope.setup;

    //fetch web3 stuff
    $http({
      method: 'POST',
      url: '/web3relay',
      data: {"addr": $scope.addrHash, "options": ["balance", "count", "bytecode"]}
    }).then(function(resp) {
      $scope.addr = $.extend($scope.addr, resp.data);
      fetchTxs();
      if (resp.data.isContract) {
        $rootScope.$state.current.data["pageTitle"] = "Contract Address";
        // fetchInternalTxs();
      }
      $http({
        method: 'GET',
        url: '/minedblockcount?addr=' + $scope.addrHash,
      }).success(function(data) {
        $scope.addr.minedBlockCount = data;
        if ($scope.activeTab === "tab_addr_4") {
          fetchMinedBlocks($scope.addr.minedBlockCount);
        }
      });
    });

    // fetch ethf balance 
    $http({
      method: 'POST',
      url: '/fiat',
      data: {"addr": $scope.addrHash}
    }).success(function(data) {
      $scope.addr.ethfiat = data.balance;
    });

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
          "infoFiltered": "(filtered from _MAX_ total txs)"
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
                        return data;  // Tx Count
                      }, "targets": [4]},
          { "render": function(data, type, row) {
                        return timeConverter(data); // Timestamp
                      }, "targets": [5]},
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
            $scope.data = resp.data;
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
            // draw table if $scope.data available.
            if ($scope.data) {
              $scope.data.recordsTotal = resp.data.recordsTotal;
              $scope.data.recordsFiltered = resp.data.recordsFiltered;
              callback($scope.data);
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
                        return '<a href="/addr/'+data+'">'+data+'</a>'
                      }, "targets": [2,3]},
          { "render": function(data, type, row) {
                        return '<a href="/block/'+data+'">'+data+'</a>'
                      }, "targets": [1]},
          { "render": function(data, type, row) {
                        return '<a href="/tx/'+data+'">'+data+'</a>'
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
      $http({
        method: 'POST',
        url: '/web3relay',
        data: {"addr_trace": $scope.addrHash}
      }).then(function(resp) {
        $scope.internal_transactions = resp.data;
      });
    }

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
          console.log(resp.data);
          scope.contract = resp.data;
        });
      }
  }
})
