//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IStableCoin.sol";

contract StableCoin is IStableCoin, ERC20{
    address public owner;
    address public vault;

    modifier onlyVault() {
        require(vault == msg.sender);
        _;
    }

    constructor() ERC20("StableCoin", "STB"){
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external override onlyVault{
        require(amount > 0);
        _mint(to, amount);
    }

    function burn(address to, uint256 amount) external override onlyVault{
        require(amount > 0);
        _burn(to, amount);
    }

    function setVault(address _vault) external {
        require(msg.sender == owner);
        vault = _vault;
    }
}