import type { NextPage } from "next";
import * as stringify from "json-stringify-safe"
import {
  createQR,
  encodeURL,
  findReference,
  FindReferenceError,
  validateTransfer,
  ValidateTransferError,
  TransactionRequestURLFields
} from "@solana/pay";
import { useConfig } from "../../contexts";
import BackLink from "../../components/BackLink";
import PageHeading from "../../components/PageHeading";
import { useEffect, useMemo, useRef, useState } from "react";
// import * as anchor from "@project-serum/anchor";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl, Connection, Keypair } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import { Web3Storage } from "web3.storage";
import { shopAddress, usdcAddress } from "../../lib/addresses";
import Button from '@mui/material/Button';
import { CToast, CToastHeader, CToastBody } from "@coreui/react"
import Box from '@mui/material/Box'
import Spinner from 'react-spinner-material'
//import { createRevokeUseAuthorityInstruction } from "@metaplex-foundation/mpl-token-metadata";

const Home: NextPage = () => {
  // ref to a div where we'll show the QR code
  const qrRef = useRef<HTMLDivElement>(null)

  // Unique address that we can listen for payments to
  const reference = useMemo(() => Keypair.generate().publicKey, [])
  const router = useRouter()
  const wallet = useWallet();
  const [show, setShow] = useState<boolean>(false);
  const [sig, setSig] = useState<string>("");

  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const [metadataURL, setMetadataURL] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [textmessage, setTextMessage] = useState<string>(
    "Uploading files to IPFS"
  );



  const getVideo = () => {
    if (typeof window !== "undefined") {
      navigator.mediaDevices
        .getUserMedia({
          video: { width: window.screen.width, height: window.screen.height },
        })
        .then((stream) => {
          let video: any = videoRef.current;
          if (video !== null) {
            video.srcObject = stream;
            video.play();
          }
        })
        .catch((err) => {
          console.log("VIDEO ERROR", err);
        });
    }
  };

  useEffect(() => {
    getVideo();
  }, [videoRef]);


  async function dataUrlToFile(
    dataUrl: string,
    fileName: string
  ): Promise<File> {
    const res: Response = await fetch(dataUrl);
    const blob: Blob = await res.blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  const getUrl = (cid: string, fileName: string) => {
    return `https://${cid}.ipfs.dweb.link/${fileName}`;
  };

  const clickPhoto = async () => {
    setLoading(true);
    let width = 700;
    let height = width / (16 / 9);

    let video: any = videoRef.current;
    let photo: any = photoRef.current;
    photo.width = width;
    photo.height = height;
    let ctx = photo.getContext("2d");
    console.log(video);
    if (ctx !== null) {
      ctx.drawImage(video, 0, 0, photo.width, photo.height);
    }
    // console.log("RUNN", photo.toDataURL("image/png"));
    // setImageDataURL(photo.toDataURL("image/png"));
    const img = photo.toDataURL("image/png");
    const file = await dataUrlToFile(img, "photo.png");

    const client = new Web3Storage({
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDE4RWUyNkM1OTgxRTQwZmU2NDc0QjliZUEwNThDN2QxMGM4NkJmZDYiLCJpc3MiOiJ3ZWIzLXN0b3JhZ2UiLCJpYXQiOjE2NTU1NTY5MDUxMTgsIm5hbWUiOiJ0aGFsaSJ9.3L4RMzKSbt9W4Ctgri2l0MYeQBYKlT_OYSE2RdUSCDA",
    });

    setTextMessage("Uploading your Photo to IPFS");
    const cid = await client.put([file]);

    console.log("Uploaded your photo to IPFS", cid);

    const imageURL = getUrl(cid, "photo.png");

    setTextMessage("Uploaded your Photo to IPFS");

    const metadata = {
      name: "Ardor 2.1 -Thali Kings",
      symbol: "ARD",
      description: "You're getting your own Customized NFT",
      seller_fee_basis_points: 750,
      image: `${imageURL}?ext=png`,
      external_url: "https://lu.ma/bengaluru-hacker-house?pk=g-dVB3i2wX6P8v6v9",
      attributes: [
        {
          trait_type: "Organizer",
          value: "Ardor",
        },
        {
          trait_type: "Organized for",
          value: "Customers",
        },
        {
          trait_type: "Country",
          value: "India",
        },
        {
          trait_type: "City",
          value: "New Delhi",
        },
      ],
      collection: {
        name: "Delhi",
        family: "Thali Kings",
      },
      properties: {
        files: [
          {
            uri: `${imageURL}?ext=png`,
            type: "image/png",
          },
        ],
        category: "image",
        creators: [
          {
            address: wallet,
            share: 90,
          },
          {
            address: shopAddress,
            share: 10,
          }
        ],
      },
    };
    var stringify = require('json-stringify-safe');

    const blob = new Blob([stringify(metadata)], {
      type: "application/json",
    });

    const metadataFile = new File([blob], "metadata.json");
    setTextMessage("Uploading Metadata to IPFS");
    const meta_cid = await client.put([metadataFile]);
    console.log("Uploaded Metadata to IPFS", meta_cid);
    setTextMessage("Uploaded Metadata to IPFS");

    const metadataURL = getUrl(meta_cid, "metadata.json");

    console.log("Metadata URL", metadataURL);
    setMetadataURL(metadataURL);
    setLoading(false);
  };

  //Read the URL query (which includes our chosen products)
  const searchParams = new URLSearchParams({ reference: reference.toString() });
  for (const [key, value] of Object.entries(router.query)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(key, v);
        }
      } else {
        searchParams.append(key, value);
      }
    }
  }
  searchParams.append("metadata", metadataURL);


  // Get a connection to Solana devnet
  const network = WalletAdapterNetwork.Devnet
  const endpoint = clusterApiUrl(network)
  const connection = new Connection(endpoint)


  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Check if there is any transaction for the reference
        const signatureInfo: any = await findReference(connection, reference, {
          finality: "confirmed",
        });
        setSig(signatureInfo.signature);
        // Validate that the transaction has the expected recipient, amount and SPL token
        if (
          signatureInfo.signature !== null &&
          signatureInfo.confirmationStatus == "finalized"
        ) {
          setShow(true);
          setTextMessage("Refresh your Wallet Collectibles for your Personalized NFT")
          return;
        }
      } catch (e) {
        if (e instanceof FindReferenceError) {
          // No transaction found yet, ignore this error
          return;
        }
        if (e instanceof ValidateTransferError) {
          // Transaction is invalid
          console.error("Transaction is invalid", e);
          return;
        }
        console.error("Unknown error", e);
      }
    }, 500);
    return () => {
      clearInterval(interval);
    };
  }, []);




  //Show the QR code
  useEffect(() => {
    // window.location is only available in the browser, so create the URL in here
    const { location } = window
    const apiUrl = `${location.protocol}//${location.host}/api/makeNFT?${searchParams.toString()}`
    console.log(window.location.protocol)
    console.log(window.location.host)
    console.log(searchParams.toString())
    const urlParams: TransactionRequestURLFields = {
      link: new URL(apiUrl),
      label: "Ardor 2.1 -Thali Kings",
      message: "Enjoy your customised NFT 🍪",
    }
    const solanaUrl = encodeURL(urlParams)
    console.log({ solanaUrl })
    const qr = createQR(solanaUrl, 512, 'transparent')
    if (qrRef.current) {
      qrRef.current.innerHTML = ''
      qr.append(qrRef.current)
    }
  })

  return (
    <div className="flex flex-col items-center gap-8">
      <Box component="span" sx={{ p: 2, border: '1px dashed grey' }}>



        {metadataURL === "" && loading === false && <video ref={videoRef} />}
        {
          metadataURL !== "" && (
            <div ref={qrRef} style={{ background: "white" }} />
          )
        }
        {
          loading && (
            <>
              <Spinner radius="xl" />
              <a>{textmessage}</a>
            </>
          )
        }

        {
          !loading && (
            <Button variant="contained"
              onClick={clickPhoto}
            >
              {" "}
            </Button>
          )
        }
        {/* <WalletMultiButton />
        <Button colorScheme="red" onClick={getTransaction} isLoading={loading}>
          Do Tx
        </Button> */}
        <div className="hidden">
          <canvas ref={photoRef}></canvas>
        </div>
      </Box>

      {show === true && <CToast id="liveToast">
        <CToastHeader closeButton>
          <svg
            className="rounded me-2"
            width="20"
            height="20"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
            focusable="false"
            role="img"
          >
            <rect width="100%" height="100%" fill="#007aff"></rect>
          </svg>
          <strong className="me-auto">Message</strong>
          <small>11 seconds ago</small>
        </CToastHeader>
        <CToastBody> title: "Transaction found",
          description: {sig},
          status: "success",
          message : {textmessage}
        </CToastBody>
      </CToast>}

      <BackLink href='/shop'>Cancel</BackLink>

      <PageHeading>Mint NFT</PageHeading>

      {/* div added to display the QR code */}
      <div ref={qrRef} />

    </div>




  );
}

export default Home;