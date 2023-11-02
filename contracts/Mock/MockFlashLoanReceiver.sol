//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../LendingVault.sol";

import "hardhat/console.sol";

contract MockFlashLoanReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address caller, bytes calldata param) external returns(bool) {        
        (address lpToken, address user, uint256 liquidationAmount) = abi.decode(param, (address, address, uint256));
        bool success1;
        bool success2;
        {
            // (success1, ) = address(msg.sender).call(abi.encodeWithSignature("liquidation(address lpToken, address user, uint256 liquidationAmount)", lpToken, user, liquidationAmount));

            // uint256 penaltyAmount = liquidationAmount * 2 / 100;
            // (, bytes memory result) = address(msg.sender).call(abi.encodeWithSignature("usdToCollateral(uint256 usdAmount, address lpToken)", penaltyAmount / 2 + liquidationAmount , lpToken));
            // (uint256 collateralAmount) = abi.decode(result, (uint256));

            // (success2, ) = address(msg.sender).call(abi.encodeWithSignature("withdraw(address lpToken, uint256 amount)", lpToken,collateralAmount));
            LendingVault(msg.sender).liquidation(lpToken, user, liquidationAmount);
            uint256 penaltyAmount = liquidationAmount * 2 / 100;
            uint256 collateralAmount = LendingVault(msg.sender).usdToCollateral(penaltyAmount / 2 + liquidationAmount, lpToken);
            LendingVault(msg.sender).withdraw(lpToken, collateralAmount);

            uint256 reward = ERC20(lpToken).balanceOf(address(this));
            if(reward != 0) {
               ERC20(lpToken).transfer(caller, reward); 
            }
        }

        uint256 totalReturn = amount + premium;
        if(ERC20(asset).balanceOf(address(this)) < totalReturn) return false;
        IERC20(asset).approve(msg.sender, totalReturn);
        return true;
    }
}