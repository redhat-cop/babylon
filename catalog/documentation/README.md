Documentation on how to perform Load Testing

1. JMeter Load Testing:
    JMeter Load Testing is a testing process done using a load testing tool named Apache JMeter which is open source desktop application based on Java. JMeter for load testing is a crucial tool that determines whether the web application under test can satisfy high load requirements or not. It also helps to analyse overall server under heavy load.

2. Now to record the script using jmeter for the performance testing we need to install some
    software.
    
    Here is a list of the software that requires to record the script:

        i. Apache JMeter : https://jmeter.apache.org/download_jmeter.cgi
        ii. Java 6 or later : https://www.java.com/en/download/help/download_options.html
        iii. Blazemeter Extension : https://chrome.google.com/webstore/detail/              blazemeter-the-continuous/mbopgmdnpcbohhpnfglgohlbhfongabi?hl=en

3. Need to installed all these software now start recording using Blazemeter Crome Extention
    
    * Using Blazemeter Extension:
    
        It is one of the fastest and easiest ways to record your performance scripts. It is also free, is to use the BlazeMeter Recorder Chrome extension. These recordings can be run in JMeter or in BlazeMeter. The extension is so useful because it lets you record performance scripts from your browser without having to configure your proxy. The Blazemeter Chrome Extension also supports recording of HTTPS traffic.



    Steps to record:-

        ~ Start Recording:

             1. After adding  the extension in the chrome, you will get the red icon. Click on this icon and login into blazemeter. Now again open that icon you will get your user name at the top.

            2. Enter a test name in the top field, you can give any name to this field(In our case we use REDHAT_TEST_[date]).Start recording by clicking on the record button, in the shape of a circle.

            3. Now enter the web application URL in any of the browser tabs and perform the web actions you want to record(in our exapmle we used : https://summit.apps-test.open.redhat.com).
    
        ~ Stop Recording:

            4. After you finish recording, click on the stop button, in the shape of a square. You can also pause your recording and then resume to continue the recording after some time.

            5. Again Click on the blazemeter icon and click on edit. All your requests will be captured and you can perform any given operation from edit-remove any request or duplicate it.

        ~ Download Recorded JMX

            6. Now you can download/save the recorded request in .jmx or JSON format, or in the cloud.You have to select the domain on which you have recorded the script .Export your recording – to run the test in JMeter, export to .jmx format by clicking on the .jmx button.
    
        ~ Run the JMX file :

            7. Open the .jmx file in JMeter. You will be able to see your test plan, which was created from the recording and the .jmx file.

            Note that this plan has new elements, like Cookie Manager and Cache Manager. They are here because browsers keep cookies and cache, and they were captured in the recording. You can clear them up if you need to. These entirely optional elements are present to simulate web browser behavior more closely.

            8. Dynamic Data : 
                
                What happens when you want to create a dynamic script, which chooses different parameters each time you test, like passwords, login information or search criteria? This is what Dynamic Data through CSV files is for.

                Create a CSV file on your computer, consisting of the different variables you are testing. Put the file in the JMeter folder(store your csv file in the samew folder where you store .jmx file). In our case, we created a basic one with name DataSet_Example.csv, with username and password.

                How to add csv file : Right-click your thread group, select Add, select Config Element, then select CSV Data Set Config.

                Configure by adding the variable names(seprated by comma). In our case, username and password.

                Go back to the HTTP Request (Nevigate to login api) and change the variable from the specific name to the ${username} and ${password}.

                The data tested will now come from the CSV file, and we will be able to see the dynamic results in the View Results Tree.

                After you build your test and check it for a low number of virtual users, it’s time to scale it up and check a large number of VUs. How many? That depends on  our needs (in our case 500).


            9. Configure the Thread Group by setting: 

                Name: Provide a custom name or, if you prefer, simply leave it named the default “Thread Group”.

                Number of Threads: The number of users (threads) you are testing. Let’s say 200.

                Ramp-up Period: How quickly (in seconds) you want to add users. For example, if set to zero, all users will begin immediately.  If set to 10, one user will be added at a time until the full amount is reached at the end of the ten seconds. Let’s say 1 seconds.

                Loop Count: How many times the test should repeat. Let’s say 1 time (no repeat).

            10. Add Listeners : 
                     
                     After running our test, we want to see its results. This is done through Listeners, a recording mechanism that shows results, including logging and debugging information.

                     The View Results Tree is the most common Listener.

                     Right-click your thread group, select “Add”, select “Listener”, then select “View Results Tree”.

                This is the basic script that created for hitting the https://summit.apps-test.open.redhat.com 

                Now click ‘Save’. Your test will be saved as a .jmx file.

                To run the test, click the green arrow on top. After the test completes running, you can view the results on the Listener.


            11. To run the test with CLI mode :

                neviage to you jmeter bin folder and run the bellow command : 

                jmeter -n -t [jmx file] -l [results file] -e -o [Path to web report folder]

                where 
                        -n : It specifies JMeter is to run in non-gui mode
                        -t : Name of JMX file that contains the Test Plan
                        -l : Name of JTL(JMeter text logs) file to log results
                        -e : Generate report dashboard after load test
                        -o : Output folder where to generate the report dashboard after load   test(Folder must not exist or be empty)

                In our case :

                jmeter -n -t REDHAT_TEST_10-13-2021.jmx -l TestLog.csv -e -o TestReport













