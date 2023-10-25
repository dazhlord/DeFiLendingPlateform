//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import '../interfaces/Oracle/AggregatorInterface.sol';
import '../interfaces/Oracle/IPriceOracleGetter.sol';
import "../interfaces/Oracle/IAssetPriceOracle.sol";
import "../interfaces/Balancer/IVault.sol";
import "../interfaces/Balancer/IWeightedPool.sol";
import {PRBMath, PRBMathUD60x18} from "../libraries/PRBMathUD60x18.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";

contract BPTPriceOracle {
    using PRBMathUD60x18 for uint256;
    using PRBMathSD59x18 for int256;

    address denominationToken;
    uint256 decimals;

    AggregatorInterface public immutable override denominationAggregator;       // normally usdc price aggregator
    IVault public constant override VAULT = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    IAssetPriceOracle oracle;

    constructor(address assetPriceOracle, address _denominationToken, address aggregator) {
        denominationAggregator = AggregatorInterface(aggregator);
        denominationToken = _denominationToken;
        oracle = IAssetPriceOracle(assetPriceOracle);
        decimals = IERC20(denoimationToken).decimals();
    }

    function getAssetPrice(address lpToken) external view returns(uint256) {
        uint256[] weights = IWeightedPool(lpToken).getNormalizedWeights();
        uint256[] tokens = VAULT.getPoolTokens(lpToken);
        int totalSupply = int(IWeightedPool(lpToken).totalSupply());

        int totalPi = PRBMathSD59x18.fromInt(1e18);

        for(uint i = 0 ;i < weights.length; i++) {
            // Get the price from chainlink from cached price feeds
            uint assetPrice = oracle.getAssetPrice(tokens[i]);
            // Value = Token Price / Token Weight
            int256 value = int256(assetPrice).div(int256(weights[i]));
            // Individual Pi = Value ** Token Weight
            int256 indivPi = value.pow(int256(weights[i]));
            // Adjust total Pi
            totalPi = totalPi.mul(indivPi);
        }
        int256 invariant = int256(IWeightedPool(lpTokenPair).getLastInvariant());

        // Pool TVL in USD
        int256 numerator = totalPi.mul(invariant);
         uint256 lpPrice = uint256((numerator.toInt().div(totalSupply)));

        // 6. Return price of BPT in denom token
        // Wad denom token
        uint256 denomPrice = oracle.getAssetPrice(denominationToken);

        // BPT Price in denom token (USDC) and adjust to denom token `decimals`
        lpTokenPrice = lpPrice.div(denomPrice * 10 ** (18 - decimals));
    }
}