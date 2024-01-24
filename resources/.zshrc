if [ -r ~/.zshrc ]; then
	JAVA_HOME_BACKUP=$JAVA_HOME
	source ~/.zshrc
	if [ -n "$JAVA_HOME_BACKUP" ]; then
		export JAVA_HOME=$JAVA_HOME_BACKUP
	fi
fi
export PATH="$JAVA_HOME/bin:$AUTO_CONFIG_PATH:$PATH"
