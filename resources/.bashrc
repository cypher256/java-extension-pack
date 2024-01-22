if [ -r ~/.bashrc ]; then
	JAVA_HOME_BACKUP=$JAVA_HOME
	source ~/.bashrc
	export JAVA_HOME=$JAVA_HOME_BACKUP
fi
export PATH="$JAVA_HOME/bin:$AUTO_CONFIG_PATH:$PATH"
