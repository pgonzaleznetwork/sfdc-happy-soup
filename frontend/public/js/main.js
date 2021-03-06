
import {foldersApi} from './folders.js';
import {autocompleteApi} from './autocompleteLib.js';
import {treeApi} from './tree.js';
import {utils as UI} from './utils.js'
import {byId} from './utils.js';
import {handleError} from './errors.js';

const SFDM = function(){

    function addEvents(){

        let wbStyleSheet = byId('workbench-stylesheet')
        let themeSwitcher = byId('theme-switcher');
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
        let optionsSubcontainer = byId('options-subcontainer');
        let optionsToggler = byId('options-toggler');
        let debugPanelContent = byId('debugPanelContent');
        let barChart;
        let memberIdsByName = new Map();
        let lastApiResponse;
        let selectedMetadataType;
        let latestIntervalId;
        let latestInvertalDone = false;
        let filterFunctionsByMetadataType = new Map();
        let debugMode = new URLSearchParams(location.search).has('debug');


        /**
         * These functions are used to filter certain metadata members from the UI.
         * In particular, custom objects and standard objects use the same
         * underlying metadata type "CustomObject" but they shouldn't be displayed
         * in the same dropdown option.
         * 
         * So here we create filter functions to remove non-standard objects from the view
         * when the selected metadata type is "Standard Objects". The same is true the other
         * way around i.e remove standard objects when the selected option is "Custom Objects..."
         * 
         * This keeps the backend API clean and unaware of this UI concern. 
         * 
         * Finally, this is implemented in a map to avoid multiple IF branches, as it's not
         * unreasonable to think we might have similar requirements in the future.
         * 
         * And, the way we know an object is standard is by checking if the id matches the name.
         * Only standard objects have this functionality.
         */
        filterFunctionsByMetadataType.set('Standard Objects',value => {
            if(value.id == value.name){
                return value;
            }
        });

        filterFunctionsByMetadataType.set('Custom Object/Setting/Metadata Type',value => {
            if(value.id != value.name){
                return value;
            }
        })

        document.addEventListener('DOMContentLoaded', loadServerInfo);
        themeSwitcher.onclick = switchTheme;
        logoutButton.onclick = logout;
        collapseButon.onclick = collapseFolders;
        expandButton.onclick = expandFolders;
        mdDropDown.onchange = submitGetMembersJob;
        queryTypeDropDown.onchange = UI.filterOptions;
        packageButton.onclick = downloadPackageXml;
        searchButton.onclick = doSearch;
        csvButton.onclick = copyFile;
        excelButton.onclick = copyFile;
        optionsToggler.onclick = toggleOptions;

        
        function loadServerInfo(){
            getSupportedMetadataTypes();
            getIdentityInfo();
            getInstanceURL();
        }

        function toggleOptions(event){
            let link = event.target;
            if(link.innerText.includes('Choose')){
                link.innerText = 'Hide toppings';
            }
            else{
                link.innerText = 'Choose your toppings';
            }
            optionsSubcontainer.classList.toggle('base-remove');
        }

        function switchTheme(event){

            event.preventDefault();

            if(wbStyleSheet.hasAttribute('disabled')){
                wbStyleSheet.removeAttribute('disabled');
                themeSwitcher.innerText = 'Switch to Happy Soup Theme';
            }
            else{
                wbStyleSheet.setAttribute('disabled','true');
                themeSwitcher.innerText = 'Switch to Workbench Theme';
            }
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

                type.supportedQueries.forEach(queryType => {

                    if(queryType.type == 'deps'){
                        option.dataset.supportsDeps = true;
                        option.dataset.depsLabel = queryType.label;
                    }
                    if(queryType.type == 'usage'){
                        option.dataset.supportsUsage = true;
                        option.dataset.usageLabel = queryType.label;
                    }

                });

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

        async function submitGetMembersJob(event){

            let callback = processGetMembersResponse;

            let selectedOption = mdDropDown.options[mdDropDown.selectedIndex];

            UI.filterQueryType(selectedOption);
            UI.filterOptions();
            UI.showProgressBar();
            UI.toggleDropdown(mdDropDown,true);
            UI.disableInputField(inputField);
            UI.disableButton(searchButton);

            selectedMetadataType = event.target.value;

            let res = await fetch(`/api/metadata?mdtype=${selectedMetadataType}`);
            let json = await res.json();

            let {jobId} = json;

            if(jobId){
                registerPolling(jobId,callback)
            }     

            else if(json.error){
                handleError(json);
                UI.toggleDropdown(mdDropDown,false);
                UI.hideProgressBar();
            }
            else{
                //we got cached data
                callback(json);
            }
        }

        
        async function processGetMembersResponse(response){

            let members = [];

            let selectedOption = mdDropDown.options[mdDropDown.selectedIndex];
            let filterFunction = filterFunctionsByMetadataType.get(selectedOption.innerText);

            //do we need to filter some members from the UI?
            if(filterFunction){
                response = response.filter(filterFunction);
            }

            response.forEach(metadata => {
                members.push(metadata.name);
                memberIdsByName.set(metadata.name,metadata.id);
            })
            
            autocompleteApi.autocomplete(inputField, members);

            //rename the selected option to display the number of metadata members
            selectedOption.label = `${selectedOption.innerText} (${members.length})`;

            UI.enableInputField(inputField,selectedMetadataType);
            UI.toggleDropdown(mdDropDown,false);
            UI.hideProgressBar();
        }

        
        async function doSearch(){

            let selectedMember = inputField.value;
            let selectedQueryType = queryTypeDropDown.value;
            let selectedMemberId = memberIdsByName.get(selectedMember);

            if(selectedMember == ''){
                window.alert('Please select a metadata member');
                return;
            }

            if(!selectedMemberId){
                window.alert(`${selectedMember} is not a valid name. You must choose a metadata member from the list`);
                return;
            }

            if(selectedQueryType == ''){
                window.alert('Please select a query type');
                return;
            }

            displayLoadingUI();

            if(selectedQueryType == 'deps'){
                submitDepsJob(selectedMember,selectedMemberId,selectedMetadataType);
            }
            else if(selectedQueryType == 'usage'){
                submitUsageJob(selectedMember,selectedMemberId,selectedMetadataType);
            }    
        }

        async function submitUsageJob(selectedMember,selectedMemberId,selectedMetadataType){

            let inputOptions = Array.from(optionsSubcontainer.getElementsByTagName('input'));
            let options = {};

            inputOptions.forEach(option => {
                
                //only send the options relevant to this metadata type
                if(option.parentElement.parentElement.dataset.metadatatype == selectedMetadataType){
                    options[option.id] =  option.checked;
                } 
            });

            options = JSON.stringify(options);

            let url = `api/usage?name=${selectedMember}&id=${selectedMemberId}&type=${selectedMetadataType}&options=${options}`;

            let response = await fetch(url);
            let json = await response.json();

            let {jobId} = json;

            if(jobId){
                let callback = processUsageResponse;
                registerPolling(jobId,callback);
            }

            else if(json.error) handleError(json);
              
        }

        async function processUsageResponse(response){

            UI.hideLoader();

            let isEmpty = (Object.keys(response.usageTree).length === 0);
            
            //if the response contains results
            if(!isEmpty){
                displayStats(response.stats,'usage');
                treeApi.createUsageTree(response.usageTree,usageTreePlaceholder);
                UI.showHelpText(response.entryPoint.name,'usage');
                lastApiResponse = response;
            }
            else{
                usageTreePlaceholder.appendChild(UI.createWarning(`No results. There are 3 main reasons for this:
                1) This metadata is not used anywhere.
                2) This metadata is part of a managed package.
                3) This metadata type is not fully supported by the MetadataComponentDependency API.
                `));
            }

            UI.toggleDropdown(mdDropDown,false);
            UI.enableButton(searchButton);
            setTimeout(UI.scrollTo,200,byId('usage-help'));
        }

        
        async function submitDepsJob(selectedMember,selectedMemberId,selectedMetadataType){

            let url = `api/dependencies?name=${selectedMember}&id=${selectedMemberId}&type=${selectedMetadataType}`;

            let response = await fetch(url);
            let json = await response.json();

            let {jobId} = json;

            if(jobId){
                let callback = processDepsResponse;
                registerPolling(jobId,callback)
            }    

            else if(json.error) handleError(response);
        }

        async function processDepsResponse(response){

            UI.hideLoader();

            let isEmpty = (Object.keys(response.dependencyTree).length === 0);
            
            //if the response contains results
            if(!isEmpty){
                displayStats(response.stats,'deps');
                treeApi.createDependencyTree(response.dependencyTree,dependencyTreePlaceholder);
                UI.showHelpText(response.entryPoint.name,'deps');
                lastApiResponse = response;
            }
            else{
                dependencyTreePlaceholder.appendChild(UI.createWarning(`No results. There are 3 main reasons for this:
                1) This metadata does not reference/use any other metadata.
                2) This metadata is part of a managed package.
                3) This metadata type is not fully supported by the MetadataComponentDependency API.
                `));
            }

            UI.toggleDropdown(mdDropDown,false);
            UI.enableButton(searchButton);
            setTimeout(UI.scrollTo,200,byId('deps-help'));
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

        async function registerPolling(jobId,callback){

            let details = {jobId,callback};
                
            latestInvertalDone = false;
            latestIntervalId = window.setInterval(checkJobStatus,4000,details);
        }

        async function checkJobStatus({jobId,callback}){

            let res = await fetch(`/api/job/${jobId}`);
            let result = await res.json();

            let {state,error,response} = result;

            if(state == 'completed' && !latestInvertalDone){
                stopPolling();
                await callback(response);
                
                if(debugMode){
                    try {
                        debugPanelContent.innerText = JSON.stringify(response);
                        UI.showDebugPanel();
                    } catch (error) {
                        console.log('debug log error',error);
                    }
                }
            }
            else if(state == 'failed' && !latestInvertalDone){
                stopPolling();
                UI.toggleDropdown(mdDropDown,false);
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
            
            UI.hideTrees();
            UI.hideHelpText();
            UI.disableButton(searchButton);
            UI.toggleDropdown(mdDropDown,true);
            UI.showLoader();
            UI.hideChart();
        }
    }

    return { addEvents}


}();


SFDM.addEvents();

