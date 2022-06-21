# Take payments IRL with Solana Pay
# also mint NFT's and Loyalty coupons for customers after ordering at your store

# solana-pay-tut-picNFTmint-loyalty
Important Remarks : Basically this template deals with minting an NFT to a User wallet when he pays anything to the Merchant(shopAddress) apart from the Loyalty coupons Check the file makeTransation.ts AND makeNFT.ts

This is a Next.js project bootstrapped with create-next-app.

Getting Started First, run the development server:

npm run dev

or
yarn dev Open http://localhost:3000 with your browser to see the result. You will also need to install ngrok, claim your free Auth token and then use command ngrok http 3000 if you want to run the full app because Solana accepts only https:// requests and not http://

You can start editing the page by modifying pages/. The page auto-updates as you edit the file.

Another Important Remark : Dont forget to add your own shopAddress and couponAddress in addresses.tx Dont forget to add SHOP_PRIVATE_KEY= in a separately created .env file.

Learn More To learn more about Next.js, take a look at the following resources:

Next.js Documentation - learn about Next.js features and API. Learn Next.js - an interactive Next.js tutorial. You can check out the Next.js GitHub repository - your feedback and contributions are welcome!

Deploy on Vercel The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out our Next.js deployment documentation for more details.
