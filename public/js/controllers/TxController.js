angular.module('BlocksApp').controller('TxController', function($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function() {   
        // initialize core components
        App.initAjax();
    });

    const web3 = new Web3();

    $rootScope.$state.current.data["pageSubTitle"] = $stateParams.hash;
    $scope.hash = $stateParams.hash;
    $scope.tx = {"hash": $scope.hash};
    $scope.settings = $rootScope.setup;

    //fetch web3 stuff
    $http({
      method: 'POST',
      url: '/web3relay',
      data: {"tx": $scope.hash}
    }).then(function(resp) {
      if (resp.data.error) {
        if (resp.data.isBlock) {
          // this is a blockHash
          $location.path("/block/" + $scope.hash);
          return;
        }
        $location.path("/err404/tx/" + $scope.hash);
        return;
      }
      $scope.tx = resp.data;
      $scope.tx.checkSumFrom = web3.utils.toChecksumAddress($scope.tx.from);
      $scope.tx.checkSumTo = web3.utils.toChecksumAddress($scope.tx.to);
      if (resp.data.timestamp)
        $scope.tx.datetime = new Date(resp.data.timestamp*1000); 
      // if (resp.data.isTrace) // Get internal txs
        fetchInternalTxs();
    });

    var fetchInternalTxs = function() {
      const data = $scope.tx.blockHash;
      $http.post('/internal_addr_on_blockhash', {blockHash: data}).then(function(resp) {
        $scope.tx.internalTxs = resp.data;
      });
    }
})
