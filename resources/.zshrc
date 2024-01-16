if [ -r ~/.zshrc ]; then
	AUTOCONF_JAVA_HOME=$JAVA_HOME
	source ~/.zshrc
	export JAVA_HOME=$AUTOCONF_JAVA_HOME
fi
export PATH="$JAVA_HOME/bin:$PATH"
