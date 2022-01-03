require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});



const getAccountsFromEnv = () => {
  let accounts = []

  if (process.env.OWNER_PRIVATE_KEY !== undefined) {
    accounts.push("0x" + process.env.OWNER_PRIVATE_KEY)
  }

  if (process.env.SIGNER_PRIVATE_KEY !== undefined) {
    accounts.push("0x" + process.env.SIGNER_PRIVATE_KEY)
  }
  return accounts;
}


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      initialBaseFeePerGas: 0, // workaround from https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136 . Remove when that issue is closed.
      // loggingEnabled: true,
      chainId: 1337,
    },
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts: getAccountsFromEnv(),
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || "",
      accounts: getAccountsFromEnv(),
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      accounts: getAccountsFromEnv(),
    },
    // mainnet: {
    //   url: process.env.MAINNET_URL || "",
    //   accounts: getAccountsFromEnv(),
    // },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 40000
  }
};
