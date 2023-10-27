//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import '../interfaces/Oracle/IPriceOracleGetter.sol';
import "../interfaces/Oracle/IOracleManager.sol";
import "../interfaces/Balancer/IVault.sol";
import "../interfaces/Balancer/IWeightedPool.sol";
import {PRBMath, PRBMathUD60x18} from "../libraries/PRBMathUD60x18.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";

import "../libraries/BNum.sol";

import "hardhat/console.sol";

contract BalancerOracle {
    using PRBMathUD60x18 for uint256;
    using PRBMathSD59x18 for int256;

    address public oracleManager;

    constructor(address _oracleManager) {
        oracleManager = _oracleManager;
    }

    function getAssetPrice(address lpToken) external view returns(uint256) {        
        require(msg.sender == oracleManager);
        IVault vault= IVault(IWeightedPool(lpToken).getVault());
        bytes32 poolId = IWeightedPool(lpToken).getPoolId();
        (address[] memory tokens , , ) = vault.getPoolTokens(poolId);
        uint256[] memory weights = IWeightedPool(lpToken).getNormalizedWeights();
        int totalSupply = int(IWeightedPool(lpToken).totalSupply());

        int totalPi = PRBMathSD59x18.fromInt(1e18);

        for(uint i = 0 ;i < weights.length; i++) {
            // Get the price from chainlink from cached price feeds
            uint assetPrice = IOracleManager(oracleManager).getAssetPrice(tokens[i]);
            console.log(tokens[i], ":", assetPrice);
            assetPrice = assetPrice.div(10 ** 10);
            // Value = Token Price / Token Weight
            int256 value = int256(assetPrice).div(int256(weights[i]));
            console.log("vaule:", uint256(value));
            // Individual Pi = Value ** Token Weight
            int256 indivPi = value.pow(int256(weights[i]));
            // Adjust total Pi
            totalPi = totalPi.mul(indivPi);
            console.log("totalPi:", uint(totalPi));
        }
        int256 invariant = int256(IWeightedPool(lpToken).getLastInvariant());

        // Pool TVL in USD
        int256 numerator = totalPi.mul(invariant);
        console.log("numerator:", uint(numerator));
        console.log("totalSupply:", uint(totalSupply));
        uint256 lpPrice = uint256((numerator.toInt().div(totalSupply)));
        lpPrice = lpPrice / (10 ** 8);  // during calulation decimal of price is grow to 16 and need to fix to 8 - usd decimal.
        console.log("lpPrice:", lpPrice);

        return lpPrice;
    }
}