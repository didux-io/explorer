angular.module('BlocksApp').controller('AccountsController', function($stateParams, $rootScope, $scope, $http, $filter) {
  $scope.settings = $rootScope.setup;

  const web3 = new Web3();

  // fetch accounts
  var getAccounts = function() {
    $("#table_accounts").DataTable({
      processing: true,
      serverSide: true,
      paging: true,
      ajax: function(data, callback, settings) {
        // get totalSupply only once.
        data.totalSupply = $scope.totalSupply || -1;
        data.recordsTotal = $scope.totalAccounts || 0;
        let totalSupply;
        $http.get('/stats').then(function(resp) {
          totalSupply = resp.data.current_supply
          $http.post('/richlist', data).then(async function(resp) {
            $scope.totalSupply = totalSupply;
            
            // set the number of total accounts
            $scope.totalAccounts = resp.data.recordsTotal;
            // fixup data to show percentages
            var newdata = resp.data.data.map(function(item) {
              var num = item[0];
              var addr = item[1];
              var type = item[2];
              var balance = item[3];
              var lastmod = item[4];
              return [num, addr, type, balance, (balance / $scope.totalSupply) * 100, lastmod];
            });
            resp.data.data = newdata;
            callback(resp.data);
          });
  
        })
      },
      lengthMenu: [
        [20, 50, 100, 150, 200, 500],
        [20, 50, 100, 150, 200, 500] // change per page values here
      ],
      pageLength: 20,
      order: [
        [3, "desc"]
      ],
      language: {
        lengthMenu: "_MENU_ accounts",
        zeroRecords: "No accounts found",
        infoEmpty: "",
        infoFiltered: "(filtered from _MAX_ total accounts)"
      },
      columnDefs: [
        { orderable: false, "targets": [0,1,4] },
        {
          render:
            function(data, type, row) {
              return '<a href="/addr/' + data +'">' + web3.utils.toChecksumAddress(data) + '</a>'
            },
          targets: [1]
        },
        {
          render:
            function(data, type, row) {
              if (data & 0x1) {
                return "Contract";
              }
              if (data & 0x4) { // user defined account type
                var accountType = data >> 3;
                accountType = accountType.toString();
                if ($scope.settings.accountTypes && $scope.settings.accountTypes[accountType]) {
                  return $scope.settings.accountTypes[accountType];
                }
                return "Genesis Alloc";
              }
              return "Account";
            },
          targets: [2]
        },
        {
          render:
            function(data, type, row) {
              return $filter('number')(data, 8);
            },
          targets: [3]
        },
        {
          render:
            function(data, type, row) {
              return $filter('number')(data, 4) + ' %';
            },
          targets: [4]
        }
      ]
    });
  };

  getAccounts();
});

// https://github.com/Smilo-platform/Wiki/wiki/Masternode-block-reward
function getTotalXsmCreated(totalBlocks) {
  if (totalBlocks >= 3200000000) totalBlocks = 3200000000;

  const increments = [{ blocks: 1, reward: 4 },
    { blocks: 20000001, reward: 2 },
    { blocks: 40000001, reward: 1.75 },
    { blocks: 60000001, reward: 1.5 },
    { blocks: 80000001, reward: 1.25 },
    { blocks: 100000001, reward: 1.0 },
    { blocks: 120000001, reward: 0.8 },
    { blocks: 140000001, reward: 0.6 },
    { blocks: 160000001, reward: 0.4 },
    { blocks: 180000001, reward: 0.2 },
    { blocks: 200000001, reward: 0.1 },
    { blocks: 400000001, reward: 0.05 },
    { blocks: 800000001, reward: 0.025 },
    { blocks: 1600000001, reward: 0.0125 }];

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