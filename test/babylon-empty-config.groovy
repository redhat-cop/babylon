// -------------- Configuration --------------
// CloudForms
def opentlc_creds = 'b93d2da4-c2b7-45b5-bf3b-ee2c08c6368e'
def opentlc_admin_creds = '73b84287-8feb-478a-b1f2-345fd0a1af47'
def cf_uri = 'https://labs.opentlc.com'
def cf_group = 'opentlc-access-cicd'
// IMAP
def imap_creds = 'd8762f05-ca66-4364-adf2-bc3ce1dca16c'
def imap_server = 'imap.gmail.com'
// Notifications
def notification_email = 'gucore@redhat.com'
def google_room_creds = 'google-room-babylon-robots'

/*
 For the following function, you need the following script approval in jenkins:

 method groovy.lang.GString getBytes java.lang.String
 method java.io.OutputStream write byte[]
 method java.net.HttpURLConnection getResponseCode
 method java.net.HttpURLConnection setRequestMethod java.lang.String
 method java.net.URL openConnection
 method java.net.URLConnection getInputStream
 method java.net.URLConnection getOutputStream
 method java.net.URLConnection setDoOutput boolean
 method java.net.URLConnection setRequestProperty java.lang.String java.lang.String
 staticMethod org.codehaus.groovy.runtime.DefaultGroovyMethods getText java.io.InputStream
*/
def post_to_room(endpoint, text_content) {
    def post = new URL("${endpoint}").openConnection();
    def message = "{\"text\":\"${text_content}\"}"
    post.setRequestMethod("POST")
    post.setDoOutput(true)
    post.setRequestProperty("Content-Type", "application/json")
    post.getOutputStream().write(message.getBytes("UTF-8"));
    def postRC = post.getResponseCode();
    println(postRC);
    if(postRC.equals(200)) {
        println(post.getInputStream().getText());
    }
}

// SSH key
def ssh_creds = '15e1788b-ed3c-4b18-8115-574045f32ce4'

// Admin host ssh location is in a credential too
def ssh_admin_host = 'admin-host-na'

// state variables
def guid=''

// Catalog items
def choices = [
    'DevOps Team Development / DEV Babylon empty-config / tests',
    'DevOps Team Development / DEV Babylon empty-config AWS / tests',
    'DevOps Team Development / DEV Babylon empty-config OSP / tests',
    'DevOps Deployment Testing / TEST Babylon empty-config / tests_prod',
    'DevOps Deployment Testing / TEST Babylon empty-config AWS / tests_prod',
    'DevOps Deployment Testing / TEST Babylon empty-config OSP / tests_prod',
    'DevOps Deployment Testing / PROD Babylon empty-config / tests_prod',
    'DevOps Deployment Testing / PROD Babylon empty-config AWS / tests_prod',
    'DevOps Deployment Testing / PROD Babylon empty-config OSP / tests_prod',
    'DevOps Deployment Testing / PROD Babylon empty-config 2 / ocp_west',
    'DevOps Deployment Testing / PROD Babylon empty-config AWS 2 / ocp_west',
    'DevOps Deployment Testing / PROD Babylon empty-config OSP 2 / ocp_west',
].join("\n")

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(daysToKeepStr: '30'))
    }

    parameters {
        booleanParam(
            defaultValue: false,
            description: 'wait for user input before deleting the environment',
            name: 'confirm_before_delete',
        )
        booleanParam(
            defaultValue: false,
            description: 'Additional debug information from Cloudforms API',
            name: 'cf_debug',
        )
        choice(
            choices: choices,
            description: 'Catalog item',
            name: 'catalog_item',
        )
    }

    stages {
        stage('order from CF') {
            environment {
                uri = "${cf_uri}"
                credentials = credentials("${opentlc_creds}")
                DEBUG = "${params.cf_debug}"
            }
            /* This step use the order_svc_guid.sh script to order
             a service from CloudForms */
            steps {
                git url: 'https://github.com/redhat-gpte-devopsautomation/cloudforms-oob'

                script {
                    def catalog = params.catalog_item.split(' / ')[0].trim()
                    def item = params.catalog_item.split(' / ')[1].trim()
                    def region = params.catalog_item.split(' / ')[2].trim()
                    echo "'${catalog}' '${item}'"

                    def command = """
                        ./opentlc/order_svc_guid.sh \
                        -c '${catalog}' \
                        -i '${item}' \
                        -G '${cf_group}' \
                        -d 'expiration=7,runtime=8,region=${region}'
                    """

                    try {

                        guid = sh(
                            returnStdout: true,
                            script: command
                        ).trim()

                    } catch(e) {

                        if (! params.cf_debug) {
                            // Run again but with DEBUG=true
                            guid = sh(
                                returnStdout: true,
                                script: "DEBUG=true " + command
                            ).trim()
                        }
                    }

                    echo "GUID is '${guid}'"

                }
            }
        }

        stage('Wait for last email and parse dummy login / password') {
            environment {
                credentials=credentials("${imap_creds}")
            }
            steps {
                git url: 'https://github.com/redhat-cop/agnosticd',
                    branch: 'development'

                script {
                    email = sh(
                        returnStdout: true,
                        script: """
                          ./tests/jenkins/downstream/poll_email.py \
                          --server '${imap_server}' \
                          --guid ${guid} \
                          --timeout 40 \
                          --filter 'has completed'
                        """
                    ).trim()

                    try {
                    	def m = email =~ /(?m)^Some random (?:string|password) (\w+)$/
                    	def password = m[0][1]
                    	echo "password from email = '${password}'"
                    } catch(Exception ex) {
                        echo "Could not parse email:"
                        echo email
                        echo ex.toString()
                        throw ex
                    }

                }
            }
        }

        stage('Confirm before retiring') {
            when {
                expression {
                    return params.confirm_before_delete
                }
            }
            steps {
                input "Continue ?"
            }
        }

        stage('Retire service from CF') {
            environment {
                uri = "${cf_uri}"
                credentials = credentials("${opentlc_creds}")
                admin_credentials = credentials("${opentlc_admin_creds}")
                DEBUG = "${params.cf_debug}"
            }
            /* This step uses the delete_svc_guid.sh script to retire
             the service from CloudForms */
            steps {
                git 'https://github.com/redhat-gpte-devopsautomation/cloudforms-oob'

                sh "./opentlc/delete_svc_guid.sh '${guid}'"

                // TODO: make sure the string OKTODELETE appears in the logs
            }
            post {
                failure {
                    withCredentials([usernameColonPassword(credentialsId: imap_creds, variable: 'credentials')]) {
                        mail(
                            subject: "${env.JOB_NAME} (${env.BUILD_NUMBER}) failed retiring for GUID=${guid}",
                            body: "It appears that ${env.BUILD_URL} is failing, somebody should do something about that.\nMake sure GUID ${guid} is destroyed.",
                            to: "${notification_email}",
                            replyTo: "${notification_email}",
                            from: credentials.split(':')[0]
                        )
                    }
                    withCredentials([string(credentialsId: google_room_creds, variable: 'web_hook_endpoint')]) {
                        post_to_room(web_hook_endpoint,
                                     "😡 ${env.JOB_NAME} (${env.BUILD_NUMBER}) failed retiring ${guid}.")
                    }
                }
            }
        }
        stage('Wait for deletion email') {
            steps {
                git url: 'https://github.com/redhat-cop/agnosticd',
                    branch: 'development'

                withCredentials([usernameColonPassword(credentialsId: imap_creds, variable: 'credentials')]) {
                    sh """./tests/jenkins/downstream/poll_email.py \
                        --guid ${guid} \
                        --timeout 20 \
                        --server '${imap_server}' \
                        --filter 'has been deleted'"""
                }
            }
        }
    }

    post {
        failure {
            git 'https://github.com/redhat-gpte-devopsautomation/cloudforms-oob'
            /* retire in case of failure */
            withCredentials(
                [
                    usernameColonPassword(credentialsId: opentlc_creds, variable: 'credentials'),
                    usernameColonPassword(credentialsId: opentlc_admin_creds, variable: 'admin_credentials')
                ]
            ) {
                sh """
                export uri="${cf_uri}"
                export DEBUG="{params.cf_debug}"
                ./opentlc/delete_svc_guid.sh '${guid}'
                """
            }

            /* Print ansible logs */
            /* this doesn't work yet
            withCredentials([
                string(credentialsId: ssh_admin_host, variable: 'ssh_admin'),
                sshUserPrivateKey(
                    credentialsId: ssh_creds,
                    keyFileVariable: 'ssh_key',
                    usernameVariable: 'ssh_username')
            ]) {
                sh("""
                    ssh -vvv -o StrictHostKeyChecking=no -i ${ssh_key} ${ssh_admin} \
                    "uptime"
                """.trim()
                )
                sh("""
                    ssh -vvv -o StrictHostKeyChecking=no -i ${ssh_key} ${ssh_admin} \
                    "find deployer_logs -name '*${guid}*log' | xargs cat"
                """.trim()
                )
            }
             */

            withCredentials([usernameColonPassword(credentialsId: imap_creds, variable: 'credentials')]) {
                mail(
                    subject: "${env.JOB_NAME} (${env.BUILD_NUMBER}) failed GUID=${guid}",
                    body: "It appears that ${env.BUILD_URL} is failing, somebody should do something about that.",
                    to: "${notification_email}",
                    replyTo: "${notification_email}",
                    from: credentials.split(':')[0]
              )
            }
            withCredentials([string(credentialsId: google_room_creds, variable: 'web_hook_endpoint')]) {
                post_to_room(web_hook_endpoint,
                             "😡 ${env.JOB_NAME} (${env.BUILD_NUMBER}) failed GUID=${guid}. It appears that ${env.BUILD_URL}/console is failing, somebody should do something about that.")
            }
        }
        fixed {
            withCredentials([string(credentialsId: google_room_creds, variable: 'web_hook_endpoint')]) {
                post_to_room(web_hook_endpoint,
                             "☺ ${env.JOB_NAME} is now FIXED, see ${env.BUILD_URL}/console")
            }

        }
    }
}
