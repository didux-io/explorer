angular.module('BlocksApp').controller('HomeController', function($rootScope, $scope, $http, $timeout) {
    $scope.$on('$viewContentLoaded', function() {
        // initialize core components
        App.initAjax();
    });

    var URL = '/data';

    const web3 = new Web3();

    $scope.reloadBlocks = function() {
      $scope.blockLoading = true;
      $http({
        method: 'POST',
        url: URL,
        data: {"action": "latest_blocks"}
      }).then(function(resp) {
        for (let i = 0; i < resp.data.blocks.length; i++) {
          resp.data.blocks[i].checkSumMinerAddress = web3.utils.toChecksumAddress(resp.data.blocks[i].miner);
        }
        $scope.latest_blocks = resp.data.blocks;
        $scope.blockLoading = false;
      });
    }
    $scope.reloadTransactions = function() {
      $scope.txLoading = true;
      $http({
        method: 'POST',
        url: URL,
        data: {"action": "latest_txs"}
      }).then(function(resp) {
        $scope.latest_txs = resp.data.txs;
        for (let i = 0; i < resp.data.txs.length; i++) {
          resp.data.txs[i].checkSumToAddress = web3.utils.toChecksumAddress(resp.data.txs[i].to);
          resp.data.txs[i].checkSumFromAddress = web3.utils.toChecksumAddress(resp.data.txs[i].from);
          // resp.data.txs[i].checkSumTxHash = web3.utils.toChecksumAddress(resp.data.txs[i].hash);
          if (resp.data.txs[i].creates) {
            resp.data.txs[i].checkSumCreatesAddress = web3.utils.toChecksumAddress(resp.data.txs[i].creates);
          }
        }
        $scope.txLoading = false;
      });
    }
    $scope.reloadBlocks();
    $scope.reloadTransactions();
    $scope.txLoading = false;
    $scope.blockLoading = false;
    $scope.settings = $rootScope.setup;

    let refreshInterval = setInterval(() => {
      $scope.reloadBlocks();
      $scope.reloadTransactions();
    }, 5000);
    $scope.$on('$destroy', () => {
      clearInterval(refreshInterval);
    });
})
.directive('simpleSummaryStats', function($http) {
  return {
    restrict: 'E',
    templateUrl: '/views/simple-summary-stats.html',
    scope: true,
    link: function(scope, elem, attrs){
      scope.stats = {};
      var statsURL = "/web3relay";
      $http.post(statsURL, {"action": "hashrate"})
       .then(function(res){
          scope.stats.hashrate = res.data.hashrate;
          scope.stats.difficulty = res.data.difficulty;
          scope.stats.blockHeight = res.data.blockHeight;
          scope.stats.blockTime = res.data.blockTime;
          //console.log(res);
	});
      }
  }
})
.directive('siteNotes', function() {
  return {
    restrict: 'E',
    templateUrl: '/views/site-notes.html'
  }
});
