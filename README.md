# Salesforce Happy Soup

Salesforce Happy Soup is a **100% free** and open source heroku app that you can use to get a full view of your Salesforce org dependencies. 

[Watch a quick demo, you willl start using it!](http://github.com) 

No complex sfdx commands, plug-ins or development knowledge required :cold_sweat: just log in and start sipping the soup! :stew: :clap:




<p align="center">
  <img src="./sfdc-happy-main.png" width="738">
</p>

## Who is this for

**Administrators** 

<img src="https://d3nqfz2gm66yqg.cloudfront.net/images/v1463575370-salesforceadminCertifiedIMg_vlyccp.png" height="100px"> 

* Find all the metadata used in page layout (fields, buttons, inline pages, etc) and export it to excel to review opportunities for optimization.
* Know the impact of making changes to a field, validation rule, etc - before you break anything!
* Know where your metadata is used 

**Developers & Architects**

* Discover **deployment boundaries** that can be the baseline for a scratch org or unlocked packages
* Quickly get a package.xml of your deployment boundary
* Get immediately insights with built-in charts
* Drill down to the last dependent metadata in an easy to follow tree structure

## Features

* :white_check_mark: -   "Where is this used" and "Deployment Boundary" visualization
* :white_check_mark: -   Easily export the dependencies to excel, csv files or package.xml
* :white_check_mark: -   Bypass all the limitations of the MetadataComponentDependency API
* :white_check_mark: -   Intuitive UI, easy to follow tree structure
* :white_check_mark: -   Log in from anywhere, no installation required
* :white_check_mark: -   Available for self-hosting locally or on your own Heroku account

## Security

We understand security is very important in the Salesforce ecosystem. With that in mind, we want to be fully transparent as to how this app uses your Salesforce data and what security mechanisms are in place.


**API Access**

When you log in to the app, you'll be asked to authorise it to send requests on your behalf using OAuth. Once you grant permission, the app will make the following API calls during its lifecylce

* Tooling API to query CustomField, CustomObject and MetadataComponentDependency records
* Metadata API to get describe information on custom fields
* SOAP API to validate that the token is still valid and to logout when requested by the user

