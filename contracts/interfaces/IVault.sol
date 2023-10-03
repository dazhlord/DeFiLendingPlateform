//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IVault {
    function setLP(address _LP) external;
    function setLTV(uint256 _LTV) external;
    function setLThreshold(uint256 _LT) external;
    function setLPenalty(uint256 _LPenalty) external;
    function setInterstRate(uint256 _rate) external;
    function deposit(uint256 amount) external;
    function borrow(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function repay(uint256 amount) external;
    function liquidation(address user, uint256 liquidationAmount) external;
    function accrue() external;
    function usdToCollateral(uint256 usdAmount) external view returns(uint256);
    function debt(address borrower) external view returns(uint256);
}
