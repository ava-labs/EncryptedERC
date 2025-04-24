import { expect } from "chai";
import { ethers } from "hardhat";
import {
  str2int,
  int2str,
  encryptMetadata,
  decryptMetadata
} from "./helpers";
import { User } from "./user";

describe("Metadata Functions", () => {
  // Generate a key pair for testing
  let user: User;
  let publicKey: bigint[];
  let privateKey: bigint;
  
  before(async () => {
    // Get a signer for the user
    const [signer] = await ethers.getSigners();
    user = new User(signer);
    publicKey = user.publicKey;
    privateKey = user.privateKey;
  });

  describe("str2int and int2str", () => {
    const testStrings = [
      "",                                           // Empty string
      "Hello, World!",                              // Basic ASCII
      "The quick brown fox jumps over the lazy dog" // Longer text
    ];

    it("should handle empty string", async () => {
      const [chunks, length] = str2int("");
      expect(length).to.be.equal(1n);
      expect(chunks.length).to.be.equal(1);
      expect(chunks[0].toString()).to.be.equal("0");
      
      const roundTrip = int2str(chunks);
      expect(roundTrip).to.be.equal("");
    });

    it("should convert strings to field elements and back", async () => {
      for (const testString of testStrings) {
        const [chunks, length] = str2int(testString);

        const roundTrip = int2str(chunks);
        expect(roundTrip).to.be.equal(testString);
      }
    });


    it("should handle max length strings", async () => {
      const longString = "a".repeat(100);
      const [chunks, length] = str2int(longString);
      const roundTrip = int2str(chunks);
      expect(roundTrip).to.be.equal(longString);
    });
  });

  describe("encryptMetadata and decryptMetadata", () => {
    const testMessages = [
      "",                                           
      "Hello",                                      
      "The quick brown fox jumps over the lazy dog" 
    ];

    it("should round-trip encrypt and decrypt messages", async () => {
      for (const message of testMessages) {
        // Encrypt the message
        const encrypted = encryptMetadata(publicKey, message);
        
        // Verify the encrypted message is a hex string
        expect(encrypted).to.be.a("string");
        expect(encrypted.startsWith("0x")).to.be.true;
        
        // Decrypt the message
        const decrypted = decryptMetadata(privateKey, encrypted);
        
        // Verify the round-trip
        expect(decrypted).to.be.equal(message);
      }
    });

    it("should handle special characters within allowed range", async () => {
      // Test with special characters in the allowed range [32, 122]
      const specialChars = ".,!?^&*()_+-=[]{}|\\:;<>,.?/";
      
      const encrypted = encryptMetadata(publicKey, specialChars);
      const decrypted = decryptMetadata(privateKey, encrypted);
      
      expect(decrypted).to.be.equal(specialChars);
    });

    it("should produce different ciphertexts for the same message", async () => {
      // Due to the nature of encryption, the same message should encrypt to different ciphertexts
      const message = "Test message";
      
      const encrypted1 = encryptMetadata(publicKey, message);
      const encrypted2 = encryptMetadata(publicKey, message);
      
      // The ciphertexts should be different
      expect(encrypted1).to.not.equal(encrypted2);
      
      // But both should decrypt to the original message
      expect(decryptMetadata(privateKey, encrypted1)).to.equal(message);
      expect(decryptMetadata(privateKey, encrypted2)).to.equal(message);
    });

    it("should have the expected format for encrypted data", async () => {
      const message = "Test format";
      const encrypted = encryptMetadata(publicKey, message);
      
      // Skip '0x' prefix
      const hexData = encrypted.slice(2);
      
      // Each 32-byte component is 64 hex characters
      // Format: length(64) + nonce(64) + authKey[0](64) + authKey[1](64) + ciphertext...
      
      // Length should be a valid hex number
      const lengthHex = hexData.slice(0, 64);
      expect(() => BigInt(`0x${lengthHex}`)).to.not.throw();
      
      // Nonce should be a valid hex number
      const nonceHex = hexData.slice(64, 128);
      expect(() => BigInt(`0x${nonceHex}`)).to.not.throw();
      
      // authKey[0] should be a valid hex number
      const authKey0Hex = hexData.slice(128, 192);
      expect(() => BigInt(`0x${authKey0Hex}`)).to.not.throw();
      
      // authKey[1] should be a valid hex number
      const authKey1Hex = hexData.slice(192, 256);
      expect(() => BigInt(`0x${authKey1Hex}`)).to.not.throw();
      
      // Remaining data should be a multiple of 64 (32 bytes)
      const ciphertextHex = hexData.slice(256);
      expect(ciphertextHex.length % 64).to.equal(0);
    });
  });

  describe("Cross-function Integration", () => {
    it("should work with empty string", async () => {
      const encrypted = encryptMetadata(publicKey, "");
      const decrypted = decryptMetadata(privateKey, encrypted);
      expect(decrypted).to.be.equal("");
    });

    it("should handle the maximum message size", async () => {
      // Create a message that is large but still under the limit
      const largeMessage = "a".repeat(2000);
      
      const encrypted = encryptMetadata(publicKey, largeMessage);
      const decrypted = decryptMetadata(privateKey, encrypted);
      
      expect(decrypted).to.be.equal(largeMessage);
    });

    it("should work with different key pairs", async () => {
      const message = "Test message";
      
      // Generate a new key pair
      const [anotherSigner] = await ethers.getSigners();
      const anotherUser = new User(anotherSigner);
      
      // Encrypt with the new public key
      const encrypted = encryptMetadata(anotherUser.publicKey, message);
      
      // Should decrypt correctly with the corresponding private key
      const decrypted = decryptMetadata(anotherUser.privateKey, encrypted);
      expect(decrypted).to.be.equal(message);
      
      // Should not decrypt correctly with a different private key
      try {
        const incorrectDecrypted = decryptMetadata(privateKey, encrypted);
        // If this doesn't throw, the decryption should at least be incorrect
        expect(incorrectDecrypted).to.not.be.equal(message);
      } catch (error) {
        // If it throws, that's also a valid outcome
      }
    });
  });
});
