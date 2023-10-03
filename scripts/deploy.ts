import { ethers } from "hardhat";
const hre = require("hardhat");
const fs = require("fs");

let trustedForwarder: any;

async function deployTargetToken(name: string, symbol: string, params: any) {
  const TargetTokenArtifacts = await ethers.getContractFactory("TargetToken");
  const TargetToken = await TargetTokenArtifacts.deploy(name, symbol, params);
  await TargetToken.deployed();
  console.log("TargetToken deployed:", TargetToken.address);

  return TargetToken.address;
}

async function deploy() {
  const ReceiverForwarderArtifacts = await ethers.getContractFactory(
    "ReceiverForwarder"
  );
  const ReceiverForwarder = await ReceiverForwarderArtifacts.deploy();
  await ReceiverForwarder.deployed();

  await hre.run("verify:verify", {
    address: ReceiverForwarder.address,
    constructorArguments: [],
  });

  trustedForwarder = ReceiverForwarder.address;

  const targetOne = await deployTargetToken(
    "TargetTokenOne",
    "TONE",
    trustedForwarder
  );
  const targetTwo = await deployTargetToken(
    "TargetTokenTwo",
    "TTWO",
    trustedForwarder
  );
  const targetThree = await deployTargetToken(
    "TargetTokenThree",
    "TTHREE",
    trustedForwarder
  );

  await hre.run("verify:verify", {
    address: targetOne,
    constructorArguments: ["TargetTokenOne", "TONE", trustedForwarder],
  });
  await hre.run("verify:verify", {
    address: targetTwo,
    constructorArguments: ["TargetTokenTwo", "TTWO", trustedForwarder],
  });
  await hre.run("verify:verify", {
    address: targetThree,
    constructorArguments: ["TargetTokenThree", "TTHREE", trustedForwarder],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deploy()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deploy;
