import {
  createTransferCheckedInstruction, getAssociatedTokenAddress, getMint, getOrCreateAssociatedTokenAccount,
  MINT_SIZE, createInitializeMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction
} from "@solana/spl-token"
import { createCreateMetadataAccountV2Instruction, DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import { CreateMetadataAccountV2InstructionArgs, createCreateMasterEditionV3Instruction } from "@metaplex-foundation/mpl-token-metadata";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js"
import { NextApiRequest, NextApiResponse } from "next"
import { couponAddress, shopAddress, usdcAddress } from "../../lib/addresses"
import calculatePrice from "../../lib/calculatePrice"
import base58 from 'bs58'
import * as anchor from "@project-serum/anchor"

export type MakeTransactionInputData = {
  account: string,
}

type MakeTransactionGetResponse = {
  label: string,
  icon: string,
}

export type MakeTransactionOutputData = {
  transaction: string,
  message: string,
}

type ErrorOutput = {
  error: string
}

function get(res: NextApiResponse<MakeTransactionGetResponse>) {
  res.status(200).json({
    label: "Ardor 2.1 - Thali Kings",
    icon: "https://freesvg.org/img/1370962427.png",
  })
}

async function post(
  req: NextApiRequest,
  res: NextApiResponse<MakeTransactionOutputData | ErrorOutput>
) {
  try {
    // We pass the selected items in the query, calculate the expected cost
    const amount = calculatePrice(req.query)
    if (amount.toNumber() === 0) {
      res.status(400).json({ error: "Can't checkout with charge of 0" })
      return
    }

    // We pass the reference to use in the query
    const { reference, metadata } = req.query
    console.log("REFERENCE", reference);

    console.log("METADATA", metadata);
    if (!reference) {
      res.status(400).json({ error: "No reference provided" })
      return
    }

    // We pass the buyer's public key in JSON body
    const { account } = req.body as MakeTransactionInputData
    if (!account) {
      res.status(40).json({ error: "No account provided" })
      return
    }

    // We get the shop private key from .env - this is the same as in our script
    const shopPrivateKey = process.env.SHOP_PRIVATE_KEY as string
    if (!shopPrivateKey) {
      res.status(500).json({ error: "Shop private key not available" })
    }
    const shopKeypair = Keypair.fromSecretKey(base58.decode(shopPrivateKey))

    const buyerPublicKey = new PublicKey(account)
    const shopPublicKey = shopKeypair.publicKey

    const network = WalletAdapterNetwork.Devnet
    const endpoint = clusterApiUrl(network)
    const connection = new Connection(endpoint)

    // Get the buyer and seller coupon token accounts
    // Buyer one may not exist, so we create it (which costs SOL) as the shop account if it doesn't 
    const buyerCouponAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      shopKeypair, // shop pays the fee to create it
      couponAddress, // which token the account is for
      buyerPublicKey, // who the token account belongs to (the buyer)
    )

    const shopCouponAddress = await getAssociatedTokenAddress(couponAddress, shopPublicKey)

    // If the buyer has at least 5 coupons, they can use them and get a discount
    const buyerGetsCouponDiscount = buyerCouponAccount.amount >= 5

    // Get details about the USDC token
    const usdcMint = await getMint(connection, usdcAddress)
    // Get the buyer's USDC token account address
    const buyerUsdcAddress = await getAssociatedTokenAddress(usdcAddress, buyerPublicKey)
    // Get the shop's USDC token account address
    const shopUsdcAddress = await getAssociatedTokenAddress(usdcAddress, shopPublicKey)

    const mintKey = anchor.web3.Keypair.generate();
    //console.log("Mint Key", mintKey.publicKey.toString());

    //Get the Buyer's ata for the NFT-mintKey
    const ata = await getAssociatedTokenAddress(mintKey.publicKey, buyerPublicKey);

    const TOKEN_PROGRAM_ID = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );

    const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    );

    const lamports = await connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );


    // Get a recent blockhash to include in the transaction
    const { blockhash } = await connection.getLatestBlockhash('finalized')

    const transaction = new anchor.web3.Transaction()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = buyerPublicKey

    // If the buyer has the coupon discount, divide the amount in USDC by 2
    const amountToPay = buyerGetsCouponDiscount ? amount.dividedBy(2) : amount

    // Create the instruction to send USDC from the buyer to the shop
    const transferInstruction = createTransferCheckedInstruction(
      buyerUsdcAddress, // source
      usdcAddress, // mint (token address)
      shopUsdcAddress, // destination
      buyerPublicKey, // owner of source address
      amountToPay.toNumber() * (10 ** usdcMint.decimals), // amount to transfer (in units of the USDC token)
      usdcMint.decimals, // decimals of the USDC token
    )

    // Add the reference to the instruction as a key
    // This will mean this transaction is returned when we query for the reference
    transferInstruction.keys.push({
      pubkey: new PublicKey(reference),
      isSigner: false,
      isWritable: false,
    })

    // Create the instruction to send the coupon from the shop to the buyer
    const couponInstruction = buyerGetsCouponDiscount ?
      // The coupon instruction is to send 5 coupons from the buyer to the shop
      createTransferCheckedInstruction(
        buyerCouponAccount.address, // source account (coupons)
        couponAddress, // token address (coupons)
        shopCouponAddress, // destination account (coupons)
        buyerPublicKey, // owner of source account
        5, // amount to transfer
        0, // decimals of the token - we know this is 0
      ) :
      // The coupon instruction is to send 1 coupon from the shop to the buyer
      createTransferCheckedInstruction(
        shopCouponAddress, // source account (coupon)
        couponAddress, // token address (coupon)
        buyerCouponAccount.address, // destination account (coupon)
        shopPublicKey, // owner of source account
        1, // amount to transfer
        0, // decimals of the token - we know this is 0
      )

    // Add the shop as a signer to the coupon instruction
    // If the shop is sending a coupon, it already will be a signer
    // But if the buyer is sending the coupons, the shop won't be a signer automatically
    // It's useful security to have the shop sign the transaction
    couponInstruction.keys.push({
      pubkey: shopPublicKey,
      isSigner: true,
      isWritable: false,
    })

    // Add both instructions to the transaction
    transaction.add(transferInstruction, couponInstruction)




    transaction.add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: buyerPublicKey,
        newAccountPubkey: mintKey.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKey.publicKey, // mint pubkey
        0, // decimals
        buyerPublicKey, // mint authority
        buyerPublicKey // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      ),
      createAssociatedTokenAccountInstruction(
        buyerPublicKey,
        ata,
        buyerPublicKey,
        mintKey.publicKey
      ),
      createMintToInstruction(
        mintKey.publicKey, // mint
        ata,
        buyerPublicKey,
        1
      )
    );

    const [metadatakey] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintKey.publicKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("METADATA KEY --", metadatakey.toString());

    const [masterKey] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintKey.publicKey.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    console.log("MASTER KEY--", masterKey.toString());

    const stringMetadata: string = metadata.toString();

    const data: DataV2 = {
      name: "Ardor 2.1 -Thali Kings",
      symbol: "ARD",
      uri: stringMetadata,
      sellerFeeBasisPoints: 1000,
      creators: [
        {
          address: shopAddress,
          verified: false,
          share: 0,
        },
        {
          address: buyerPublicKey,
          verified: false,
          share: 100,
        },
      ],
      collection: null,
      uses: null,
    };

    const args = {
      data,
      isMutable: false,
    };

    const createMetadataV2 = createCreateMetadataAccountV2Instruction(
      {
        metadata: metadatakey,
        mint: mintKey.publicKey,
        mintAuthority: buyerPublicKey,
        payer: buyerPublicKey,
        updateAuthority: buyerPublicKey,
      },
      {
        createMetadataAccountArgsV2: args,
      }
    );
    transaction.add(createMetadataV2);

    const createMasterEditionV3 = createCreateMasterEditionV3Instruction(
      {
        edition: masterKey,
        mint: mintKey.publicKey,
        updateAuthority: buyerPublicKey,
        mintAuthority: buyerPublicKey,
        payer: buyerPublicKey,
        metadata: metadatakey,
      },
      {
        createMasterEditionArgs: {
          maxSupply: new anchor.BN(1),
        },
      }
    );

    createMasterEditionV3.keys.push(
      {
        pubkey: new PublicKey(reference),
        isSigner: false,
        isWritable: false
      }
    );
    transaction.add(createMasterEditionV3);


    // Sign the transaction as the shop, which is required to transfer the coupon and request NFT creation at Metaplex
    // We must partial sign because the transfer instruction still requires the buyerPublicKey
    transaction.partialSign(shopKeypair, mintKey)


    // Serialize the transaction and convert to base64 to return it
    const serializedTransaction = transaction.serialize({
      // We will need the buyer to sign this transaction after it's returned to them
      requireAllSignatures: false
    })
    const base64 = serializedTransaction.toString('base64')

    // Insert into database: reference, amount

    const message = buyerGetsCouponDiscount ? "50% Discount! 🍪" : "Thanks for your order! 🍪"

    // Return the serialized transaction
    res.status(200).json({
      transaction: base64,
      message,
    })
  } catch (err) {
    console.error(err);

    res.status(500).json({ error: 'error creating transaction', })
    return
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MakeTransactionGetResponse | MakeTransactionOutputData | ErrorOutput>
) {
  if (req.method === "GET") {
    return get(res)
  } else if (req.method === "POST") {
    return await post(req, res)
  } else {
    return res.status(405).json({ error: "Method not allowed" })
  }
}