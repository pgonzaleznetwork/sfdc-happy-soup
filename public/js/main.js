
import {foldersApi} from './folders.js';
import {autocompleteApi} from './autocompleteLib.js';
import {treeApi} from './tree.js';
import {utils} from './utils.js'
import {byId} from './utils.js';
import {handleError} from './errors.js';

const SFDM = function(){

    function addEvents(){

        let inputField = byId("input-field");
        let queryTypeDropDown = byId('query-type');
        let searchButton = byId('search-button');
        let logoutButton = byId('logout-button');
        let collapseButon = byId('collapse-button');
        let expandButton = byId('expand-button');
        let mdDropDown = byId('md-type-select');
        let packageButton = byId('package-button');
        let dependencyTreePlaceholder = byId('dependency-tree-placeholder');
        let usageTreePlaceholder = byId('usage-tree-placeholder');
        let csvButton = byId('csv-button');
        let excelButton = byId('excel-button');
        let canvasContainer = byId('canvas-container');
        let canvas = byId('stats');
        let barChart;
        let memberIdsByName = new Map();
        let lastApiResponse;
        let selectedMetadataType;
        let latestIntervalId;
        let latestInvertalDone = false;

        document.addEventListener('DOMContentLoaded', loadServerInfo);
        logoutButton.onclick = logout;
        collapseButon.onclick = collapseFolders;
        expandButton.onclick = expandFolders;
        mdDropDown.onchange = getMetadataMembers;
        packageButton.onclick = downloadPackageXml;
        searchButton.onclick = doSearch;
        inputField.onkeyup = clickFindButton;
        csvButton.onclick = copyFile;
        excelButton.onclick = copyFile;

        function loadServerInfo(){
            getSupportedMetadataTypes();
            getIdentityInfo();
            getInstanceURL();
        }

        async function getInstanceURL(){

            try {
                let res = await fetch('/api/oauthinfo/instanceurl');
                let json = await res.json();

                let instanceURL = json;

                localStorage.setItem('lastUsedDomain',instanceURL);

            } catch (error) {
                //no error handling required because this is not critical to the app functionality
            }
        }

        async function getIdentityInfo(){

            try {
                let response = await fetch('/identity');
                let json = await response.json();
            
                byId('identity').innerText = `${json.name} (${json.username}) - ${json.env}`;

            } catch {
                //no error handling required because this is not critical to the app functionality
            }
        }

        async function getSupportedMetadataTypes(){

            let url = '/api/supportedtypes';
            let res = await fetch(url);
            let types = await res.json();

            types.forEach(type => {
                let option = document.createElement('option');
                option.value = type.value;
                option.innerText = type.label;
                mdDropDown.appendChild(option);
            })
        }

        async function logout(event){

            event.preventDefault();

            await fetch('/oauth2/logout');
            window.location = '/';
        }

        function collapseFolders(){

            document.querySelectorAll('.'+foldersApi.OPEN_FOLDER_CLASS).forEach(folder => {
                foldersApi.collapseFolder(folder);
            });
        }

        function expandFolders(){

            document.querySelectorAll('.'+foldersApi.CLOSED_FOLDER_CLASS).forEach(folder => {
                foldersApi.expandFolder(folder);
            });
        }

        function clickFindButton(event){

            let enterKey = 13;
    
            if (event.keyCode == enterKey) {
                event.preventDefault();
                searchButton.click();
            }
        }

        

        async function getMetadataMembers(event){

            utils.showProgressBar();
            utils.toggleDropdown(mdDropDown,true);
            utils.disableInputField(inputField);
            utils.disableButton(searchButton);

            selectedMetadataType = event.target.value;

            let res = await fetch(`/api/metadata?mdtype=${selectedMetadataType}`);
            let json = await res.json();

            let {jobId} = json;

            if(jobId){
                callItselfWhenJobIsDone(jobId,getMetadataMembers,arguments);
            }     

            else if(json.error){
                handleError(json);
                utils.toggleDropdown(mdDropDown,false);
                utils.hideProgressBar();
            }
            else{

                //if

                let members = [];

                json.forEach(metadata => {
                    members.push(metadata.name);
                    memberIdsByName.set(metadata.name,metadata.id);
                })
                
                autocompleteApi.autocomplete(inputField, members);

                //rename the selected option to display the number of metadata members
                let selectedOption = mdDropDown.options[mdDropDown.selectedIndex];
                selectedOption.label = `${selectedOption.innerText} (${members.length})`;
    
                utils.enableInputField(inputField,selectedMetadataType);
                utils.toggleDropdown(mdDropDown,false);
                utils.hideProgressBar();
            }   
        }

    
        async function doSearch(){

            let selectedMember = inputField.value;
            let selectedQueryType = queryTypeDropDown.value;
            let selectedMemberId = memberIdsByName.get(selectedMember);

            if(selectedMember == ''){
                window.alert('Please select a metadata member');
                return;
            }

            if(selectedQueryType == ''){
                window.alert('Please select a query type');
                return;
            }

            displayLoadingUI();

            if(selectedQueryType == 'deps'){
                findDependencies(selectedMember,selectedMemberId,selectedMetadataType);
            }
            else if(selectedQueryType == 'usage'){
                findUsage(selectedMember,selectedMemberId,selectedMetadataType);
            }    
        }

        async function findUsage(selectedMember,selectedMemberId,selectedMetadataType){

            let url = `api/usage?name=${selectedMember}&id=${selectedMemberId}&type=${selectedMetadataType}`;

            let response = await fetch(url);
            let json = await response.json();

            let {jobId} = json;

            if(jobId){
                callItselfWhenJobIsDone(jobId,findUsage,arguments);
            }    
            
            else if(json.error) handleError(response);

            else{
                
                utils.hideLoader();

                let isEmpty = (Object.keys(json.usageTree).length === 0);
                
                //if the response contains results
                if(!isEmpty){
                    displayStats(json.stats,'usage');
                    treeApi.createUsageTree(json.usageTree,usageTreePlaceholder);
                    utils.showHelpText(json.entryPoint.name,'usage');
                    lastApiResponse = json;
                }
                else{
                    usageTreePlaceholder.appendChild(utils.createWarning(`No results. There are 3 main reasons for this:
                    1) This metadata is not used anywhere.
                    2) This metadata is part of a managed package.
                    3) This metadata type is not fully supported by the MetadataComponentDependency API.
                    `));
                }

                utils.toggleDropdown(mdDropDown,false);
                utils.enableButton(searchButton);
                setTimeout(utils.scrollTo,200,byId('usage-help'));
            }
        }

        async function findDependencies(selectedMember,selectedMemberId,selectedMetadataType){

            let url = `api/dependencies?name=${selectedMember}&id=${selectedMemberId}&type=${selectedMetadataType}`;

            let response = await fetch(url);
            let json = await response.json();

            let {jobId} = json;

            if(jobId){
                callItselfWhenJobIsDone(jobId,findDependencies,arguments);
            }    
            
            else if(json.error) handleError(response);

            else{

                utils.hideLoader();

               let isEmpty = (Object.keys(json.dependencyTree).length === 0);
                
                //if the response contains results
                if(!isEmpty){
                    displayStats(json.stats,'deps');
                    treeApi.createDependencyTree(json.dependencyTree,dependencyTreePlaceholder);
                    utils.showHelpText(json.entryPoint.name,'deps');
                    lastApiResponse = json;
                }
                else{
                    dependencyTreePlaceholder.appendChild(utils.createWarning(`No results. There are 3 main reasons for this:
                    1) This metadata does not reference/use any other metadata.
                    2) This metadata is part of a managed package.
                    3) This metadata type is not fully supported by the MetadataComponentDependency API.
                    `));
                }

                utils.toggleDropdown(mdDropDown,false);
                utils.enableButton(searchButton);
                setTimeout(utils.scrollTo,200,byId('deps-help'));
            }
        }

        function displayStats(stats,type){

            //remove the contents of the previously initialized chart
            if(barChart){
                barChart.destroy();
            }

            let availableBackgroundColors = [
                'rgba(255, 99, 132, 0.2)',
                'rgba(54, 162, 235, 0.2)',
                'rgba(255, 206, 86, 0.2)',
                'rgba(75, 192, 192, 0.2)',
                'rgba(153, 102, 255, 0.2)',
                'rgba(255, 159, 64, 0.2)'
            ];
            let chartLabels = [];
            let chartValues = [];

            for (const key in stats) {
                chartLabels.push(key);
                chartValues.push(stats[key]);
            }

            let backgroundColors = [];

            chartLabels.forEach(val => {
                let randomValue = availableBackgroundColors[Math.floor(Math.random() * availableBackgroundColors.length)]; 
                backgroundColors.push(randomValue);
            })

            let ctx = canvas.getContext('2d');

            let label = (type === 'usage' ? '# of Metadata Types using it' : '# of Metadata Types required for deployment');

            canvasContainer.style.display = 'block';

            barChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: label,
                        data: chartValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 2
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        yAxes: [{
                            ticks: {
                                beginAtZero: true
                            }
                        }]
                    }
                }
            }); 
        }

        async function callItselfWhenJobIsDone(jobId,originalFunction,params){

            params = Array.from(params);

            let details = {jobId,originalFunction,params};
                
            latestInvertalDone = false;
            latestIntervalId = window.setInterval(checkJobStatus,2000,details);
        }

        async function checkJobStatus({jobId,originalFunction,params}){

            let res = await fetch(`/api/job/${jobId}`);
            let result = await res.json();

            let {state,error} = result;

            if(state == 'completed' && !latestInvertalDone){
                stopPolling();
                await originalFunction(...params);
            }
            else if(state == 'failed' && !latestInvertalDone){
                stopPolling();
                utils.toggleDropdown(mdDropDown,false);
                handleError(error);
            }
        }

        function stopPolling(){
            latestInvertalDone = true;
            window.clearInterval(latestIntervalId);
        }

        function copyFile(event){

            //nothing to copy if we haven't had a response at all i.e the page was just loaded
            if(!lastApiResponse) return;

            let button = event.target;

            let originalName = button.innerText;
            button.innerText = 'Copied! ';

            setTimeout(resetName,3000,button,originalName);

            if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
                var textarea = document.createElement('textarea');
                textarea.textContent = lastApiResponse[button.dataset.format];
                textarea.style.position = "fixed";  // Prevent scrolling to bottom of page in Microsoft Edge.
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    return document.execCommand("copy");  // Security exception may be thrown by some browsers.
                }
                catch (ex) {
                    console.warn("Copy to clipboard failed.", ex);
                    return false;
                }
                finally {
                    document.body.removeChild(textarea);
                }
            }
        }

        function resetName(button,originalName){
            button.innerText = originalName;
        }


        function downloadPackageXml(){

            //need to validate if the last api response was valid

            let hiddenLink = document.createElement('a');
            hiddenLink.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(lastApiResponse.packageXml));
            hiddenLink.setAttribute('download', `${lastApiResponse.entryPoint.name}-package.xml`);            
            hiddenLink.style.display = 'none';

            document.body.appendChild(hiddenLink);
            hiddenLink.click();
            document.body.removeChild(hiddenLink); 
        }

        function displayLoadingUI(){
            
            utils.hideTrees();
            utils.hideHelpText();
            utils.disableButton(searchButton);
            utils.toggleDropdown(mdDropDown,true);
            utils.showLoader();
            utils.hideChart();
        }
    }

    return { addEvents}


}();


SFDM.addEvents();

