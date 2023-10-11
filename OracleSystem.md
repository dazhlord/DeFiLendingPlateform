# Oracle System
Where Uniswap V2, Balancer, Curve LP price is calculated.

## Main Structure
Reference Aave protocol's Oracle contract.

Get Price from Chainlink's Aggregator.
Store Aggregator addresses corresponding to LP tokens.
LP Tokens and Aggregator addresses are initialized in constructor and can be updated by Admin.

Get Price of LP Token in one transaction and also Prices of LP Tokens in a single transaction.

Make sure that Oracle system gets prices for whitelisted LP tokens.

## How to prevent attack
To prevent flash loan attack, check the price changes when getting new price.

To prevent reentrancy attack, use Chainlink oracle network so reduce vulnerability of source trust.
