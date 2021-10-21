# Steps to load test :

### 1. Installation :
    
Here is a list of the tools that requires to record and perfom the test : 

• Apache Jmeter : https://jmeter.apache.org/download_jmeter.cgi
   
• Blazemeter Extension : https://chrome.google.com/webstore/detail/blazemeter-the-continuous/mbopgmdnpcbohhpnfglgohlbhfongabi?hl=en

<br/>
         
### 2. Recording a new test :

#### Start Recording :

1. After adding  the extension in Google chrome, click on blazemeter extention icon and login into blazemeter. Click on the icon again to get the name on the top.

2. Enter a test name in the top field,(In our case we use REDHAT_TEST_[date]).Start recording by clicking on the record          button, in the shape of a circle.

3. Now enter the web application URL in any of the browser tabs and perform the web actions you want to record(in our exapmle we used :                              https://summit.apps-dev.open.redhat.com).

####  Stop Recording :

4. After you finish recording, click on the stop button, in the shape of a square. You can also pause your recording and then resume to continue the recording after some time.

5. Again Click on the blazemeter icon and click on edit. All your requests will be captured and you can perform any given operation from edit-remove any request or duplicate it.

####  Download Recorded JMX file :

6. Now you can download/save the recorded request in .jmx or JSON format, or in the cloud.You have to select the domain on which you have recorded the script .Export your recording – to run the test in JMeter, export to .jmx format by clicking on the .jmx button.

<br/>

### 3. Configuring JMX file using Jmeter UI :


Open the .jmx file in JMeter. You will be able to see your test plan, which was created from the recording and the .jmx file.

(Note that this plan has new elements, like Cookie Manager and Cache Manager. They are here because browsers keep cookies and cache, and they were captured in the recording. You can clear them up if you need to. These entirely optional elements are present to simulate web browser behavior more closely)


#### Configure the Thread Group :

1. Name : Provide a custom name or, if you prefer, simply leave it named the default “Thread Group”.

2. Number of Threads : The number of users (threads) you are testing. Let’s say 200.

3. Ramp-up Period : How quickly (in seconds) you want to add users. For example, if set to zero, all users will begin immediately.  If set to 10, one user will                       be added at a time until the full amount is reached at the end of the ten seconds. Let’s say 1 seconds.

4. Loop Count: How many times the test should repeat. Let’s say 1 time (no repeat).

#### Dynamic Data :

What happens when you want to create a dynamic script, which chooses different parameters each time you test, like username,password,login information or search   criteria? This is what Dynamic Data through CSV files is for.

Create a CSV file on your computer, consisting of the different variables you are testing. Put the file in the JMeter folder(store your csv file in the same folder where you stored your .jmx file). In our case, we created a basic one with name DataSet_Example.csv, with variable name username and password.

1. How to add csv file : Right-click your thread group, select Add, select Config Element, then select CSV Data Set Config.

2. Configure by adding the variables name(seprated by comma). In our case, username and password are two variables.

3. Go back to the HTTP Request (Nevigate to login api) and change the variable from the specific name to the ${username} and ${password}.

The data tested will now come from the CSV file, and we will be able to see the dynamic results in the View Results Tree.

After you build your test and check it for a low number of virtual users, it’s time to scale it up and check a large number of VUs. How many? That depends on  our needs (in our case 500).

#### Add Listeners :

After running our test, we want to see its results. This is done through Listeners, a recording mechanism that shows results, including logging and debugging information.

The View Results Tree is the most common Listener. To add the lsitener (Right-click your thread group, select “Add”, select “Listener”, then select “View Results Tree”).

This is the basic script that created for hitting the https://summit.apps-dev.open.redhat.com

<br/>

### 4. Execute the test using JMeter UI :

#### Run the JMX file :

1. Now click on ‘Save’. Your test will be saved as a .jmx file.

2. To run the test, click the green arrow on top. After the test completes running, you can view the results on the Listener(we added view result tree as a          listener).

<br/>

### 5.  Execute the test using JMeter CLI :

#### To run the test with CLI mode :

Neviage to you jmeter bin folder and run the bellow command :

       jmeter -n -t [jmx file] -l [results file] -e -o [Path to web report folder]

where,

-n : It specifies JMeter is to run in non-gui mode.
      
-t : Name of JMX file that contains the Test Plan.
    
-l : Name of JTL(JMeter text logs) file to log results.
      
-e : Generate report dashboard after load test.
      
-o : Output folder where to generate the report dashboard after load   test(Folder must not exist or be empty).
      

**In our case** :

       jmeter -n -t REDHAT_TEST_10-08-2021.jmx -l TestLog.csv -e -o TestReport

<br/>

### 6.Running the test on container :

1. login your self with oc
2. ./oc project
3. List of all the name space: ./oc get namespace
4. Select project: ./oc project [NAMESPACE]
5. Create a container from helm yaml: helm template helm/ | oc apply -f -
   (Learn how to install and get running with Helm : https://helm.sh/docs/intro/install)
6. Check weather the container is up and running: ./oc get deployment
7. Check the POD name: ./oc get pod
8. Copy files from local to tmp directory: ./oc cp [source file address] [pod]:./tmp
(copy the .jmx file and csv file)
9. Open remote shell: ./oc rsh deployment/[deployment name]

**Run the test :** 
 
        JVM_ARGS="-Xms12288m -Xmx12288m" jmeter -n -t REDHAT_TEST_10-08-2021.jmx -l TestLog.csv -e -o TestReport
 
 where,
 
 JVM_ARGS="-Xms12288m -Xmx12288m" : Increase the heap size.
 
 -n : It specifies JMeter is to run in non-gui mode.
 
 -t : Name of JMX file that contains the Test Plan.
 
 -l : Name of JTL(JMeter text logs) file to log results.
 
 -e : Generate report dashboard after load test.
 
 -o : Output folder where to generate the report dashboard after load test(Folder must not exist or be empty).

 
 10.Copy back reports from tmp direcory to the local storage : ./oc cp [pod]:./tmp [lacal storage address].
 
 11.Delete once test executes: ./oc delete deployment [deployment name]

<br/>

### 7. Test Metrics (Observe spike in the container) :

#### See the Memory,CPU,File System,Network In,Network Out usage :

        https://console-openshift-console.apps.babydev.dev.open.redhat.com/k8s/ns/babylon-summit-ui/pods/babylon-catalog-api-684745ff4-sjf9v

<br/>

### 8. Past load test reports and metrics : 
           
        https://drive.google.com/drive/u/0/folders/1RUvzjqWNFM668zE7qHFNs1xQ_XJd_cd_
           
(You can get access permission from dave.dekker@atlanticbt.com)
