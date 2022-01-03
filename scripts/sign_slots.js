const hre = require("hardhat");
const ethers = hre.ethers;

const fs = require('fs');


const filename = "wallets.txt";

async function main() {

  const [owner, signer] = await ethers.getSigners();
  console.log("signing using:", signer.address);

  const createSignedSlot = async (grantee) => {
    const message = ethers.utils.keccak256(grantee);

    const signature = await signer.signMessage(
      ethers.utils.arrayify(message),
    );
    return { grantee, signature };
  }

  let addresses = fs.readFileSync(filename, 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }
  });

  addresses = addresses.split("\n").filter(addy => addy !== "");

  let slots = [];
  promises = addresses.map((addy) => createSignedSlot(addy).then(x => slots.push(x)));

  await Promise.all(promises);

  slots = slots.sort((left, right) => left.grantee - right.grantee);

  console.log(JSON.stringify(slots));
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
