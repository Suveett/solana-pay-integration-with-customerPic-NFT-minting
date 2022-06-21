import thali from '../../assets/thali.png';
import { createQR, encodeURL, TransferRequestURLFields, findReference, validateTransfer, FindReferenceError, ValidateTransferError, TransactionRequestURLFields } from "@solana/pay";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl, Connection, Keypair } from "@solana/web3.js";
import { useRouter } from "next/router";
import { useState, useEffect, useMemo, useRef } from "react";
import BackLink from "../../components/BackLink";
import PageHeading from "../../components/PageHeading";
import { shopAddress, usdcAddress } from "../../lib/addresses";
import calculatePrice from "../../lib/calculatePrice";
import { Web3Storage } from "web3.storage";
import { useWallet } from "@solana/wallet-adapter-react";

export default function Checkout() {

  const [metadataURL, setMetadataURL] = useState<string>("");
  const [imageURL, setImageURL] = useState<string>("");
  const thaliPhoto = { thali }
  const { wallet } = useWallet();
  const router = useRouter()

  // ref to a div where we'll show the QR code
  const qrRef = useRef<HTMLDivElement>(null)

  const amount = useMemo(() => calculatePrice(router.query), [router.query])

  // Unique address that we can listen for payments to
  const reference = useMemo(() => Keypair.generate().publicKey, [])

  //---------------------------------------------------------------------------------------------------------

 //Web3.storage function to retrieve the CID
  const getUrl = (cid: string, fileName: string) => {
    return `https://${cid}.ipfs.dweb.link/${fileName}`;
  };

  function toDataURL(url: string, callback: Function) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
      var reader = new FileReader();
      reader.onloadend = function () {
        callback(reader.result);
      }
      reader.readAsDataURL(xhr.response);
    };
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.send();
  }



  async function dataUrlToFile(
    dataUrl: string,
    fileName: string
  ): Promise<File> {
    const res: Response = await fetch(dataUrl);
    const blob: Blob = await res.blob();
    return new File([blob], fileName, { type: "image/png" });
  }


  async function clientMetaDataUrl() {

    const client = new Web3Storage({
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDE4RWUyNkM1OTgxRTQwZmU2NDc0QjliZUEwNThDN2QxMGM4NkJmZDYiLCJpc3MiOiJ3ZWIzLXN0b3JhZ2UiLCJpYXQiOjE2NTU1NTY5MDUxMTgsIm5hbWUiOiJ0aGFsaSJ9.3L4RMzKSbt9W4Ctgri2l0MYeQBYKlT_OYSE2RdUSCDA",
    });

    const url : any = toDataURL('https://freesvg.org/img/thali.png', function(dataUrl : string) {
      console.log('RESULT:', dataUrl)
      })
    
    const file = await dataUrlToFile(url, "thali.png");
    const cid = await client.put([file])//"bafybeibtxa34b3ng54vk37fjsxxqlrfsmqz6djrvc5foj3p75hka2kbe4i"
    const imageURL = getUrl(cid, "thali.png");
    console.log("Image URL :", imageURL)
    setImageURL(imageURL)

    


    const metadata = {
      name: "Ardor 2.1 -Thali Kings",
      symbol: "ARD",
      description: "You're getting your Free NFT",
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

    const meta_cid = await client.put([metadataFile]);
    console.log("Uploading Metadata to IPFS", meta_cid);


    const metadataURL = getUrl(meta_cid, "metadata.json");

    console.log("Metadata URL", metadataURL);
    setMetadataURL(metadataURL);
    
  }


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
  //searchParams.append("image", imageURL);

  // Get a connection to Solana devnet
  const network = WalletAdapterNetwork.Devnet
  const endpoint = clusterApiUrl(network)
  const connection = new Connection(endpoint)

  //Show the QR code
  useEffect(() => {
    // window.location is only available in the browser, so create the URL in here
    const { location } = window
    const apiUrl = `${location.protocol}//${location.host}/api/makeTransaction?${searchParams.toString()}`
    console.log(window.location.protocol)
    console.log(window.location.host)
    console.log(searchParams.toString())
    const urlParams: TransactionRequestURLFields = {
      link: new URL(apiUrl),
      label: "Ardor 2.1 -Thali Kings",
      message: "Thanks for your order! 🍪",
    }
    const solanaUrl = encodeURL(urlParams)
    console.log({ solanaUrl })
    const qr = createQR(solanaUrl, 512, 'transparent')
    if (qrRef.current && amount.isGreaterThan(0)) {
      qrRef.current.innerHTML = ''
      qr.append(qrRef.current)
    }
  })

  //=====================================================================================  
  // // Solana Pay 'transfer' params
  // const urlParams: TransferRequestURLFields = {
  //   recipient: shopAddress,
  //   splToken: usdcAddress,
  //   amount,
  //   reference,
  //   label: "Ardor 2.1 -Thali Kings",
  //   message: "Thank you for your order! 🍪",
  // }

  // // Encode the params into the format shown
  // const url = encodeURL(urlParams)
  // console.log({ url })

  // // Show the QR code
  // useEffect(() => {
  //   const qr = createQR(url, 512, 'transparent')
  //   if (qrRef.current && amount.isGreaterThan(0)) {
  //     qrRef.current.innerHTML = ''
  //     qr.append(qrRef.current)
  //   }
  // })
  //=====================================================================================  

  // Check every 0.5s if the transaction is completed
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Check if there is any transaction for the reference
        const signatureInfo = await findReference(connection, reference, { finality: 'confirmed' })
        // Validate that the transaction has the expected recipient, amount and SPL token
        await validateTransfer(
          connection,
          signatureInfo.signature,
          {
            recipient: shopAddress,
            amount,
            splToken: usdcAddress,
            reference,
          },
          { commitment: 'confirmed' }
        )
        await clientMetaDataUrl()
        router.push('/shop/confirmed')
      } catch (e) {
        if (e instanceof FindReferenceError) {
          // No transaction found yet, ignore this error
          return;
        }
        if (e instanceof ValidateTransferError) {
          // Transaction is invalid
          console.error('Transaction is invalid', e)
          return;
        }
        console.error('Unknown error', e)
      }
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-8">
      <BackLink href='/shop'>Cancel</BackLink>

      <PageHeading>Checkout ${amount.toString()}</PageHeading>

      {/* div added to display the QR code */}
      <div ref={qrRef} />

      
    </div>
  )
}