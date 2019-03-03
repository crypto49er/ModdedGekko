// RSI + Candle 
// Created by Crypto49er
// Version 2 (Version 1 was made for my heavily modded version of Gekko, version 2 is for based version of Gekko)
//
// This strategy is designed for 5 minute candles.
// Idea 1: When RSI drops aggressively (>18 points) and goes way below 30 (< 12), there's an 
// excellent chance the price shoots back up and over 70 RSI. 
// Idea 2: When RSI drops below 30 and candle creates a hammer, it means the bears are 
// exhausted and immediate gains should occur in the new few candles.

// Buy when RSI < 12 and RSI dropped more than 18 points compared to previous 2 candles
// Buy when RSI < 30 and candle is a hammer
// Sell when RSI > 70 
// Sell when 1% stop loss

const fs = require('fs');
const log = require('../core/log');
const config = require ('../core/util.js').getConfig();

const CandleBatcher = require('../core/candleBatcher');
const RSI = require('../strategies/indicators/RSI.js');
const SMA = require('../strategies/indicators/SMA.js');

// Let's create our own strat
var strat = {};
var buyPrice = 0.0;
var currentPrice = 0.0;
var rsi5 = new RSI({ interval: 14 });
var sma5 = new SMA(200);
var advised = false;
var rsi5History = [];
var counter = 0;
var disableTrading = false;
var priceHistory = [];
var sma5History = [];
var highestRSI = 0; // highestRSI in last 5 candles
var candle5 = {};
var fiatLimit = 100;
var assetLimit = 0.74062586; // $100 USD if ETH is ~$135

// Prepare everything our method needs
strat.init = function() {
  this.name = "RSI + Candle";
  this.requiredHistory = config.tradingAdvisor.historySize;
  this.tradeInitiated = false;

  // since we're relying on batching 1 minute candles into 5 minute candles
  // lets throw if the settings are wrong
  if (config.tradingAdvisor.candleSize !== 1) {
    throw "This strategy must run with candleSize=1";
  }

  // create candle batchers for 5 minute candles
  this.batcher5 = new CandleBatcher(5);

  // supply callbacks for 5 minute candle function
  this.batcher5.on('candle', this.update5);


  // Add an indicator even though we won't be using it because
  // Gekko won't use historical data unless we define the indicator here
  this.addIndicator('rsi', 'RSI', { interval: this.settings.interval});

  fs.readFile(this.name + '-balanceTracker.json', (err, contents) => {
    var fileObj = {};
    if (err) {
      log.warn('No file with the name', this.name + '-balanceTracker.json', 'found. Creating new tracker file');
      fileObj = {
        assetLimit: assetLimit,
        fiatLimit: fiatLimit,
      };
      fs.appendFile(this.name + '-balanceTracker.json', JSON.stringify(fileObj), (err) => {
        if(err) {
          log.error('Unable to create balance tracker file');
        }
      });
    } else {
      try {
        fileObj = JSON.parse(contents)
        assetLimit = fileObj.assetLimit;
        fiatLimit = fileObj.fiatLimit;
      }
      catch (err) {
        log.error('Tracker file empty or corrupted');
      }
    }
  });

  log.info('Buy Limit', fiatLimit, 'Sell Limit', assetLimit);
}

// What happens on every new candle?
strat.update = function(candle) {
  currentPrice = candle.close;

  // write 1 minute candle to 5 minute batchers
  this.batcher5.write([candle]);
  this.batcher5.flush();

  // Send message that bot is still working after 24 hours (assuming minute candles)
  counter++;
  if (counter == 1440){
    if (lastTraded){
      log.remote(this.name, ' - Bot is still working. \n Last Trade:', lastTraded);
    } else {
      log.remote(this.name, ' - Bot is still working.');
    }
    counter = 0;
  }

}

strat.update5 = function(candle) {
  rsi5.update(candle);
  sma5.update(candle.close);

  candle5 = this.batcher5.calculatedCandles[0];
  //log.debug('5 minute candle.close ', candle5.close);

  // Store the last three 5 minute candle prices
  priceHistory.push(candle.close);
  if (priceHistory.length > 10) {
    priceHistory.shift();
  }

  // Store the last three sma5 prices
  sma5History.push(sma5.result);
  if (sma5History.length > 3) {
    sma5History.shift();
  }

  // We only need to store RSI for 10 candles
  rsi5History.push(rsi5.result);
  if (rsi5History.length > 10) {
    rsi5History.shift();
  }

  highestRSI = 0;
  for (i=5;i<=rsi5History.length-1;i++){
    if(rsi5History[i] > highestRSI) {
      highestRSI = rsi5History[i];
    }
  }
  
  //Send price and RSI to console every 5 minutes
  //log.info('Price', currentPrice, 'SMA', sma5.result, 'RSI', rsi5.result.toFixed(2));
}

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function() {

  // Buy when RSI < 12 and RSI dropped more than 18 points compared to previous 2 candles
  if (rsi5.result < 12 && (rsi5History[7] > rsi5.result + 18 || rsi5History[8] > rsi5.result + 18 ) 
  && !advised && !disableTrading && !this.tradeInitiated){
    log.info('Buy because RSI less than 12');
    this.advice({ 
      direction: 'long',
      amount: currency > fiatLimit ? fiatLimit : currency,
    });
    advised = true;
    return;
  }

  
  // //Buy when RSI < 30 and candle is a hammer
  if (rsi5.result < 30 && candle5.open > candle5.low && candle5.open - candle5.low > candle5.low * 0.006 
    && candle5.open > candle5.close && (candle5.open - candle5.close)/(candle5.open - candle5.low) < 0.25 && !advised && !disableTrading && !this.tradeInitiated){
    log.info('Buy because RSI less than 30 and candle is a hammer');
    this.advice({ 
      direction: 'long',
      amount: currency > fiatLimit ? fiatLimit : currency,
    });
    advised = true;
    return;
  }

  // Sell when RSI > 70
  if (rsi5.result > 70 && advised && !this.tradeInitiated) {
    log.info('Take Profit - RSI past 70');
    this.advice({
      direction: 'short',
      amount: asset > assetLimit ? assetLimit : asset,
    });
    advised = false;
    return;
  }

  // Sell if currentPrice <= buyPrice * 0.99 (1% stop loss)
  if (currentPrice <= buyPrice * 0.99 && advised && !this.tradeInitiated){
    log.info('Stop Loss - 1% loss');
    this.advice({
      direction: 'short',
      amount: asset > assetLimit ? assetLimit : asset,
    });
    advised = false;
    return;
  } 

}

// This is called when trader.js initiates a 
// trade. Perfect place to put a block so your
// strategy won't issue more trader orders
// until this trade is processed.
strat.onPendingTrade = function(pendingTrade) {
  this.tradeInitiated = true;

}


// This runs whenever a trade is completed
// as per information from the exchange.
// The trade object looks like this:
// {
//   id: [string identifying this unique trade],
//   adviceId: [number specifying the advice id this trade is based on],
//   action: [either "buy" or "sell"],
//   price: [number, average price that was sold at],
//   amount: [number, how much asset was trades (excluding "cost")],
//   cost: [number the amount in currency representing fee, slippage and other execution costs],
//   date: [moment object, exchange time trade completed at],
//   portfolio: [object containing amount in currency and asset],
//   balance: [number, total worth of portfolio],
//   feePercent: [the cost in fees],
//   effectivePrice: [executed price - fee percent, if effective price of buy is below that of sell you are ALWAYS in profit.]
// }
strat.onTrade = function(trade) {
  this.tradeInitiated = false;
  
  if (trade.action == 'buy') {
    assetLimit = fiatLimit / trade.price;
  }

  if (trade.action == 'sell') {
    fiatLimit = trade.amount * trade.price;
  }
  var fileObj = {
    assetLimit: assetLimit,
    fiatLimit: fiatLimit,
  }
  fs.writeFile(this.name + '-balanceTracker.json', JSON.stringify(fileObj), (err) => {
    if(err) {
      log.error('Unable to write to balance tracker file');
    }
  });

  lastTraded = trade.date.format('l LT');
}

// Trades that didn't complete with a buy/sell
strat.onTerminatedTrades = function(terminatedTrades) {
  log.info('Trade failed. Reason:', terminatedTrades.reason);
  this.tradeInitiated = false;
}

// This runs whenever the portfolio changes
// including when Gekko starts up to talk to 
// the exhange to find out the portfolio balance.
// This is how the portfolio object looks like:
// {
//   currency: [number, portfolio amount of currency],
//   asset: [number, portfolio amount of asset],
// }
strat.onPortfolioChange = function(portfolio) {

  // Sell if we start out holding a bag
  // We determine this as currency and asset starts out
  // at 0 before we get the info from the exchange. 
  // if (asset == 0 && currency == 0 && portfolio.asset > 0) {
  //   log.info('Starting with a sell as Gekko probably crashed after a buy')
  //   //this.advice('short');
  // }

  asset = portfolio.asset;
  currency = portfolio.currency;

}

strat.onCommand = function(cmd) {
  var command = cmd.command;
  if (command == 'start') {
      cmd.handled = true;
      cmd.response = "Hi. I'm Gekko. Ready to accept commands. Type /help if you want to know more.";
  }
  if (command == 'status') {
      cmd.handled = true;
      cmd.response = config.watch.currency + "/" + config.watch.asset +
      "\nPrice: " + currentPrice +
      "\nRSI: " + rsi5.result.toFixed(2) +
      "\nRSI History: " + rsi5History[7].toFixed(2) + ", " + rsi5History[8].toFixed(2) + ", " + rsi5History[9].toFixed(2);
  }
  if (command == 'help') {
  cmd.handled = true;
      cmd.response = "Supported commands: \n\n /buy - buy at next candle" + 
      "\n /sell - sell at next candle " + 
      "\n /status - show RSI and current portfolio" +
      "\n /stop - disable buying";
    }
  if (command == 'buy') {
  cmd.handled = true;
  log.info('Manual buy/sell disabled');
  }
  if (command == 'sell') {
  cmd.handled = true;
  log.info('Manual buy/sell disabled');
  }
  if (command == 'stop') {
    cmd.handled = true;
    if (cmd.arguments == 'true') {
      disableTrading = true;
      cmd.response = 'Gekko disabled from buying.';
    }
    if (cmd.arguments == 'false') {
      disableTrading = false;
      cmd.response = 'Gekko buying enabled.';
    }
  }
}



module.exports = strat;
