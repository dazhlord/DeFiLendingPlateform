//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockFlashLoanReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address caller, bytes calldata param) external returns(bool) { 
        if(ERC20(asset).balanceOf(address(this)) < (amount + premium)) return false;
        IERC20(asset).approve(msg.sender, amount + premium);
        return true;
    }
}