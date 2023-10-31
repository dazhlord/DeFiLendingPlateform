// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9; 

import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {ICurvePool, ICurvePool2} from "../interfaces/Convex/ICurvePool.sol"; 
import "../interfaces/Oracle/IOracleManager.sol";
import {vMath} from "../libraries/vMath.sol";

import "hardhat/console.sol";

//used for all curveV1 amd V2 tokens, no need to redeploy
contract CurveOracle {

	address public oracleManager;

	constructor(address _oracle) {
		oracleManager = _oracle;
	}

	function getAssetPrice(address pool) external view returns(uint256 price) {
		require(msg.sender == oracleManager);

        uint256 poolSize = 0;
		for(uint i =0; i < 4; i ++){
			try ICurvePool(pool).coins(i) returns (address) {
			poolSize++;
			} catch {
				//ignore error
			}
		}

        uint256[] memory prices = new uint256[](poolSize);

        for (uint256 i =0; i < poolSize; i++) {
            address underlying = ICurvePool(pool).coins(i);

            prices[i] = IOracleManager(oracleManager).getAssetPrice(underlying); //handles case where underlying is curve too.
			// underlyingBalance = ICurvePool(pool).balances(i);
            require(prices[i] != 0, "ERR_ORACLE_UNDERLYING_FAIL");
			// price = price + prices[i] * underlyingBalance;
        }
        price = get_price_v2(pool, prices);
		// uint256 totalSupply = ICurvePool(pool).totalSupply();
		// price = price / totalSupply;
		console.log("CurvePrice:", price);
	}

	/**	
     * @dev Calculates the value of a curve v2 lp token (not pegged)
     * @param curve_pool The curve pool address (not the token address!)
     * @param prices The price of the underlying assets in the curve pool
     **/
	function get_price_v2(address curve_pool, uint256[] memory prices) internal view returns(uint256) {
		//check_reentrancy(curve_pool, reentrancyType);
        uint256 virtual_price = ICurvePool(curve_pool).get_virtual_price();

		uint256 lp_price = calculate_v2_token_price(
			uint8(prices.length),
			virtual_price,
			prices
		);	
		
		return lp_price;
	}
	
	//returns n_token * vp * (p1 * p2 * p3) ^1/n	
	//n should only ever be 2 or 3 for v2 pools
	//returns the lp_price scaled by 1e36, so scale down by 1e18
	function calculate_v2_token_price(
		uint8 n,
		uint256 virtual_price,
		uint256[] memory prices
	) internal pure returns(uint256) {
		uint256 product = vMath.product(prices); 
		uint256 geo_mean = vMath.nthroot(n, product);
		return (n * virtual_price * geo_mean) / 1e18; 
	}
	
    //Just used for calling curve remove liquidity. Without this, remove_liquidity cannot find function selector receive()
	receive() external payable {
	}
}