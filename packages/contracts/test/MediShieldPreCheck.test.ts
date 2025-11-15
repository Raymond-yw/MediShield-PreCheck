import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

describe("MediShieldPreCheck", () => {
  let deployer: HardhatEthersSigner;
  let applicant: HardhatEthersSigner;
  let contract: any;
  let contractAddress: string;

  before(async () => {
    [deployer, applicant] = await hre.ethers.getSigners();
    const factory = await hre.ethers.getContractFactory("MediShieldPreCheck");
    contract = await factory.connect(deployer).deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();

  });

  async function encryptAge(value: number) {
    const input = hre.fhevm.createEncryptedInput(contractAddress, applicant.address);
    input.add8(value);
    const encrypted = await input.encrypt();
    return {
      handle: encrypted.handles[0],
      proof: encrypted.inputProof,
    };
  }

  async function encryptBool(value: boolean) {
    const input = hre.fhevm.createEncryptedInput(contractAddress, applicant.address);
    input.addBool(value);
    const encrypted = await input.encrypt();
    return {
      handle: encrypted.handles[0],
      proof: encrypted.inputProof,
    };
  }

  async function evaluate(age: number, history: boolean, chronic: boolean, lifestyle: boolean) {
    const ageCipher = await encryptAge(age);
    const historyCipher = await encryptBool(history);
    const chronicCipher = await encryptBool(chronic);
    const lifestyleCipher = await encryptBool(lifestyle);

    const handle = await contract
      .connect(applicant)
      .checkEligibility.staticCall(
        ageCipher.handle,
        ageCipher.proof,
        historyCipher.handle,
        historyCipher.proof,
        chronicCipher.handle,
        chronicCipher.proof,
        lifestyleCipher.handle,
        lifestyleCipher.proof,
      );

    const tx = await contract
      .connect(applicant)
      .checkEligibility(
        ageCipher.handle,
        ageCipher.proof,
        historyCipher.handle,
        historyCipher.proof,
        chronicCipher.handle,
        chronicCipher.proof,
        lifestyleCipher.handle,
        lifestyleCipher.proof,
      );
    await tx.wait();

    const decrypted = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      handle,
      contractAddress,
      applicant,
    );

    return {
      category: Number(decrypted),
      handle,
    };
  }

  it("returns Eligible when no risk flags and age within range", async () => {
    const { category, handle } = await evaluate(30, false, false, false);
    expect(category).to.equal(1);

    const [storedHandle, timestamp] = await contract.getLastEligibility(applicant.address);
    expect(storedHandle).to.equal(handle);
    expect(timestamp).to.be.gt(0);
  });

  it("returns Moderate when any risk flags are true", async () => {
    const { category } = await evaluate(40, true, false, false);
    expect(category).to.equal(2);

    const { category: secondCategory } = await evaluate(25, false, true, true);
    expect(secondCategory).to.equal(2);
  });

  it("returns Not Eligible when age is below range", async () => {
    const { category } = await evaluate(17, false, false, false);
    expect(category).to.equal(3);
  });

  it("returns Not Eligible when age is above range regardless of risks", async () => {
    const { category } = await evaluate(70, false, false, false);
    expect(category).to.equal(3);
  });

  it("treats boundary ages as eligible when no risk flags", async () => {
    const { category: lower } = await evaluate(18, false, false, false);
    expect(lower).to.equal(1);

    const { category: upper } = await evaluate(64, false, false, false);
    expect(upper).to.equal(1);
  });

  it("returns zero handle and timestamp when user never evaluated", async () => {
    const [, timestamp] = await contract.getLastEligibility(deployer.address);
    expect(timestamp).to.equal(0);
  });
});

