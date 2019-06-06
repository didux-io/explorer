angular.module('BlocksApp').controller('TokenListController', function($stateParams, $rootScope, $scope, $http) {
    $scope.$on('$viewContentLoaded', function() {   
        // initialize core components
        App.initAjax();
    });

    $rootScope.showHeaderPageTitle = true;

    $http.get('/TOKENS.json')
      .then(function(res){
        $scope.tokens = res.data;
      })

})