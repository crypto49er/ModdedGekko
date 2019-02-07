// DCA - Dollar Cost Average
//
// This strategy is made for the Gekko Mod Gekko-DCA
// https://github.com/crypto49er/gekko-DCA
// This strategy will issue a buy signal based on the
// specified time frame you determine (default: 1x a week)
// It will use a defined amount of currency (USD, EUR, BTC)
// to buy an asset (BTC, ETH, LTC).
// It will never issue a sell signal.
//
// The default defined amount is 10. If you want to adjust the amount, 
// you need to go to plugins/trader/trader.js to modify it. (Line 185)


var log = require('../core/log');
var config = require ('../core/util.js').getConfig();

// Let's create our own strat
var strat = {};

// Prepare everything our method needs
strat.init = function() {

  // We exit if candle size is not 1440 (1 day)
  // This makes it easy to calculate how often
  // the bot should issue a buy signal

  if (config.tradingAdvisor.candleSize !== 1440) {
    throw "This strategy must run with candleSize=1440, go to the config file and adjust the candle size under config.TradingAdvisor";
  }

  // Set how often to issue a buy signal in the config
  this.buyFrequency = config.DCA.frequency;

  this.buyCounter = 0;
  this.input = 'candle';
  this.requiredHistory = 0;
  this.tradeInitiated = false;

}

// What happens on every new candle?
strat.update = function(candle) {

}

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function() {

  this.buyCounter++;
  log.debug('Buy Counter ', this.buyCounter);

  if (this.buyCounter >= this.buyFrequency && !this.tradeInitiated) {
    this.advice('long');
    this.buyCounter = 0;
  }
}

// Prevent additional trades from happening until trade is completed
// Not necessary for time frames higher than 1 hour, but it's enabled 
strat.onPendingTrade = function () {
  log.info('Trade Initiated');
  this.tradeInitiated = true;
}

strat.onTrade = function() {
  log.info('Trade Completed');
  this.tradeInitiated = false;
}

module.exports = strat;
