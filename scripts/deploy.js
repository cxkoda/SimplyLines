// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ethers = hre.ethers;


const _deployContract = async (name, factory, args = []) => {
  const contract = await factory.deploy(...args);

  console.log(`Delpoying ${name} in tx ${contract.deployTransaction.hash}`);
  console.log(contract.deployTransaction.gasPrice.toNumber() / 1e9)

  const receipt = await contract.deployed();

  console.log(`Contract ${name} was deployed to ${contract.address}`);
  // console.log(`done with errors: ${receipt.error}`);
  console.log('');

  return contract;
}

const deployContract = async (name, args, factoryArgs = {}) => {
  const factory = await ethers.getContractFactory(name, factoryArgs);
  return await _deployContract(name, factory, args);
}



async function main() {

  const [owner, signer] = await ethers.getSigners();

  ceoAddress = owner.address;
  devAddress = owner.address;

  const balanceStart = await ethers.provider.getBalance(owner.address);
  {
    const gasPrice = await ethers.provider.getGasPrice();
    console.log(`Starting deployment with deployment with balance=${ethers.utils.formatUnits(balanceStart, 18)} at a gas=${ethers.utils.formatUnits(gasPrice, 9)}`);
  }


  const network = await ethers.provider.getNetwork();
  console.log("Network:", network, "\n");

  console.log("Using owner:", owner.address)
  console.log("Using signer:", signer.address)

  await deployContract("SimplyLines", [devAddress, ceoAddress, signer.address, ceoAddress, devAddress])

  {
    const balanceEnd = await ethers.provider.getBalance(owner.address);
    const gasPrice = await ethers.provider.getGasPrice();
    console.log(`Finishing deployment with deployment with balance=${ethers.utils.formatUnits(balanceStart, 18)} at gas=${ethers.utils.formatUnits(gasPrice, 9)}`);


    const diff = balanceStart.sub(balanceEnd);
    console.log('Deployment cost:', ethers.utils.formatUnits(diff, 18));
    console.log('Deployment cost (@50 Gwei):', ethers.utils.formatUnits(diff.mul(ethers.utils.parseUnits("50", "gwei")).div(gasPrice), 18));
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
