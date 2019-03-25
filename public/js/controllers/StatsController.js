angular.module('BlocksApp').controller('StatsController', function($stateParams, $rootScope, $scope) {

    $rootScope.showHeaderPageTitle = true;
  
    /*
      Chart types: 
        etc_hashrate: ETC Hashrate Growth
        miner_hashrate: Miner Hashrate Distribution
    */

    const CHART_TYPES = {
        "miner_hashrate": {
            "title": "Miner Hashrate Distribution"
        }
    }

    $rootScope.$state.current.data["pageSubTitle"] = CHART_TYPES[$stateParams.chart].title;

})