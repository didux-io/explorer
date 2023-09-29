const Web3 = require('web3');

class Web3Provider {
  constructor(connectionUrls) {
    this.connectionUrls = connectionUrls;
    this.providers = this.initializeProviders();
    this.currentIndex = 0;
  }

  initializeProviders() {
    return this.connectionUrls.map(url => new Web3.providers.HttpProvider(url));
  }

  getNextProvider() {
    const provider = this.providers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.providers.length;
      return provider;
  }

  send(payload, callback) {
    const provider = this.getNextProvider();
    provider.send(payload, callback);
  }
}
module.exports = Web3Provider;
