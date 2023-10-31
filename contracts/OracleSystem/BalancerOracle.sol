//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import '../interfaces/Oracle/IPriceOracleGetter.sol';
import "../interfaces/Oracle/IOracleManager.sol";
import "../interfaces/Balancer/IVault.sol";
import "../interfaces/Balancer/IBalancerPool.sol";

import "hardhat/console.sol";

contract BalancerOracle {

    address public oracleManager;

    constructor(address _oracleManager) {
        oracleManager = _oracleManager;
    }

    function getAssetPrice(address lpToken) external view returns(uint256) {        
        require(msg.sender == oracleManager);
        IVault vault= IVault(IBalancerPool(lpToken).getVault());
        bytes32 poolId = IBalancerPool(lpToken).getPoolId();
        (address[] memory tokens , uint256[] memory balances , ) = vault.getPoolTokens(poolId);
        // uint256[] memory weights = IBalancerPool(lpToken).getNormalizedWeights();
        uint256 totalSupply = IBalancerPool(lpToken).totalSupply();

        uint256 totalValue = 0;

        uint256 bptIndex = IBalancerPool(lpToken).getBptIndex();
        uint256 baseDecimal = ERC20(lpToken).decimals();

        for(uint i = 0 ; i < tokens.length; i++) {
            // Get the price from chainlink from cached price feeds
            if(i != bptIndex) {
                uint tokenDecimal = ERC20(tokens[i]).decimals();
                uint assetPrice = IOracleManager(oracleManager).getAssetPrice(tokens[i]);
                totalValue += assetPrice * balances[i] * (10 ** (baseDecimal - tokenDecimal));
            }
        }
        uint256 lpPrice = totalValue * 1e8 / totalSupply;
        return lpPrice;
    }
}