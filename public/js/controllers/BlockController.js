angular.module('BlocksApp').controller('BlockController', function($stateParams, $rootScope, $scope, $http, $location) {
    $scope.$on('$viewContentLoaded', function() {   
        // initialize core components
        App.initAjax();
        //TableAjax.init();
    });

    $rootScope.$state.current.data["pageSubTitle"] = $stateParams.number;
    $scope.blockNum = $stateParams.number;
    $scope.settings = $rootScope.setup;

    const web3 = new Web3();

    //fetch transactions
    $http({
      method: 'POST',
      url: '/web3relay',
      data: {"block": $scope.blockNum}
    }).then(function(resp) {
      if (resp.data.error)
        $location.path("/err404/block/" + $scope.blockNum);
      else {
        resp.data.checkSummedMinerAddress = web3.utils.toChecksumAddress(resp.data.miner);
        $scope.block = resp.data;
        $scope.block.blockReward = getBlockReward(resp.data.number)
        $scope.block.datetime = new Date(resp.data.timestamp*1000); 
      }
    });
})

let getBlockReward = function (b) {
  if (b >= 0 && b < 20000001) {
      return 4;
  }
  if (b > 20000000 && b < 40000001) {
      return 2;
  }
  if (b > 40000000 && b < 60000001) {
      return 1.75;
  }
  if (b > 60000000 && b < 80000001) {
      return 1.5;
  }
  if (b > 80000000 && b < 100000001) {
      return 1.25;
  }
  if (b > 100000000 && b < 120000001) {
      return 1.0;
  }
  if (b > 120000000 && b < 140000001) {
      return 0.8;
  }
  if (b > 140000000 && b < 160000001) {
      return 0.6;
  }
  if (b > 160000000 && b < 180000001) {
      return 0.4;
  }
  if (b > 180000000 && b < 200000001) {
      return 0.2;
  }
  if (b > 200000000 && b < 400000001) {
      return 0.1;
  }
  if (b > 400000000 && b < 800000001) {
      return 0.05;
  }
  if (b > 800000000 && b < 1600000001) {
      return 0.025;
  }
  if (b > 1600000000 && b < 3200000001) {
      return 0.0125;
  }
};