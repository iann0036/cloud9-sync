# Live Share for AWS Cloud9

>**Note:** This extension is still in alpha stages. Please [raise an issue](https://github.com/iann0036/cloud9-sync/issues) if you experience any problems.

![Live Share for AWS Cloud9 Screenshot](https://raw.githubusercontent.com/iann0036/cloud9-sync/master/resources/screenshot.png)

## Setup

To start using this extension, you'll need an AWS IAM Key Pair in order to authenticate you. We initally recommend assigning the [AWSCloud9Administrator](https://console.aws.amazon.com/iam/home#/policies/arn:aws:iam::aws:policy/AWSCloud9Administrator$jsonEditor) role to your user.

You can enter your key-pair by clicking on the Environments refresh button, or by hitting `F1` and entering the `Cloud9 Sync: Setup` option. This will present the field you need to fill in order to give that workspace access.


## Connecting

Once you've entered your credentials, click the refresh button in the Environments view. This should populate all environments to which you have access to. You can connect to your chosen environment by right-clicking on the item and clicking `Connect`. Connection may take up to a minute to fully complete and will initially synchronize your workspace.


## Disconnecting

Similarly to connecting, you may disconnect by right-clicking on the connected environment and clicking `Disconnect`.


## Using Remote Terminal

You can right-click on your connected environment and click the `Create Terminal` option. This will open a new terminal connected to your AWS Cloud9 environment.
