//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStableCoin is IERC20{

    function mint(address to, uint256 amount) external;

    function burn(address to, uint256 amount) external;

    function setVault(address to, bool state) external;
}